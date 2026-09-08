import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Tenant, TenantDocument } from '../../database/schemas/tenant.schema';
import { Store, StoreDocument } from '../../database/schemas/store.schema';
import { ExchangeRate, ExchangeRateDocument } from '../../database/schemas/exchange-rate.schema';
import { CurrencyService } from '../../common/services/currency.service';
import { CurrencyBackfillService } from '../../common/services/currency-backfill.service';
import { fetchBaseRates } from '../../common/utils/fx-provider.util';
import { AutomationRunnerService, AutomationJobResult } from './automation-runner.service';
import { isAutomationEnabled } from './automation.util';

/**
 * Daily auto-refresh of exchange rates for every currency pair a tenant actually
 * uses (each active store currency → the tenant base currency), from a free
 * provider. Manual rates always win: an auto rate is skipped for any pair the
 * owner has manually set for the day. After refreshing, unconverted (flagged)
 * transactions are back-converted.
 */
@Injectable()
export class FxRateScheduler {
  private readonly logger = new Logger(FxRateScheduler.name);

  constructor(
    @InjectModel(Tenant.name) private tenantModel: Model<TenantDocument>,
    @InjectModel(Store.name) private storeModel: Model<StoreDocument>,
    @InjectModel(ExchangeRate.name) private exchangeRateModel: Model<ExchangeRateDocument>,
    private currencyService: CurrencyService,
    private backfillService: CurrencyBackfillService,
    private automationRunner: AutomationRunnerService,
  ) {}

  @Cron('0 6 * * *', { name: 'fx-rate-sync', timeZone: 'UTC' })
  async syncRates(): Promise<void> {
    if (!isAutomationEnabled()) return;
    await this.automationRunner.run('fx-rate-sync', () => this.runSync());
  }

  private async runSync(): Promise<AutomationJobResult> {
    const tenants = await this.tenantModel.find({ isActive: true }).select('_id').lean();
    // Cache provider responses per base currency so tenants sharing a base
    // currency only cost one upstream call per run.
    const rateCache = new Map<string, Record<string, number> | null>();
    let processed = 0;
    let errors = 0;

    for (const tenant of tenants) {
      try {
        await this.syncTenant(String(tenant._id), rateCache);
        processed += 1;
      } catch (err) {
        errors += 1;
        this.logger.warn(
          `FX sync failed for tenant ${tenant._id}: ${err instanceof Error ? err.message : err}`,
        );
      }
    }

    return {
      summary: `FX rates synced for ${processed} tenant(s)` + (errors ? `, ${errors} failed` : ''),
      processed,
      errors,
    };
  }

  async syncTenant(
    tenantId: string,
    rateCache?: Map<string, Record<string, number> | null>,
  ): Promise<void> {
    const base = await this.currencyService.resolveTenantBaseCurrency(tenantId);
    const tid = new Types.ObjectId(tenantId);

    const stores = await this.storeModel
      .find({ tenantId: tid, isActive: true })
      .select('currency')
      .lean<{ currency?: string }[]>();

    const currencies = [
      ...new Set(
        stores
          .map((s) =>
            String(s.currency || '')
              .trim()
              .toUpperCase(),
          )
          .filter((c) => /^[A-Z]{3}$/.test(c) && c !== base),
      ),
    ];
    if (currencies.length === 0) return;

    let rates = rateCache?.get(base);
    if (rates === undefined) {
      rates = await fetchBaseRates(base);
      rateCache?.set(base, rates);
    }
    if (!rates) return; // provider unavailable this run — try again tomorrow

    const startOfDay = new Date();
    startOfDay.setUTCHours(0, 0, 0, 0);

    for (const from of currencies) {
      const perBase = Number(rates[from]); // units of `from` per 1 base
      if (!Number.isFinite(perBase) || perBase <= 0) continue;
      const rate = Math.round((1 / perBase) * 1_000_000) / 1_000_000; // base per 1 `from`

      const existing = await this.exchangeRateModel
        .findOne({ tenantId: tid, fromCurrency: from, toCurrency: base, effectiveAt: startOfDay })
        .lean<{ source?: string }>();
      if (existing?.source === 'manual') continue; // never clobber a manual override

      await this.exchangeRateModel.updateOne(
        { tenantId: tid, fromCurrency: from, toCurrency: base, effectiveAt: startOfDay },
        {
          $set: {
            tenantId: tid,
            fromCurrency: from,
            toCurrency: base,
            rate,
            isActive: true,
            source: 'auto',
            note: 'Auto-fetched (open.er-api.com)',
          },
        },
        { upsert: true },
      );
    }

    // Now that fresh rates exist, back-convert any transactions that were
    // recorded while a rate was missing.
    await this.backfillService.backfillTenant(tenantId);
  }
}
