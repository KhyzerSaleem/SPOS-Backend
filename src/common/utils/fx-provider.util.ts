import { Logger } from '@nestjs/common';

const logger = new Logger('FxProvider');

/**
 * Free, no-key FX source covering ~160 currencies (incl. PKR, SAR, BDT, NGN,
 * MYR, TRY … which the ECB/Frankfurter feed does not). Returns a map of
 * `units of X per 1 base` for the requested base currency, or null on failure.
 *
 * Example: fetchBaseRates('USD') -> { PKR: 278.5, SAR: 3.75, EUR: 0.92, ... }
 * So to convert an amount in X to the base currency: amount / rates[X].
 */
export async function fetchBaseRates(baseCurrency: string): Promise<Record<string, number> | null> {
  const base = String(baseCurrency || '')
    .trim()
    .toUpperCase();
  if (!/^[A-Z]{3}$/.test(base)) return null;

  const fetchFn: typeof fetch | undefined = (globalThis as any).fetch;
  if (!fetchFn) {
    logger.error('global fetch is unavailable (requires Node 18+)');
    return null;
  }

  try {
    const res = await fetchFn(`https://open.er-api.com/v6/latest/${base}`, {
      // Node fetch has no default timeout; abort so a hung provider never stalls the job.
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      logger.warn(`FX provider returned HTTP ${res.status} for base ${base}`);
      return null;
    }
    const data: any = await res.json();
    if (data?.result !== 'success' || !data?.rates || typeof data.rates !== 'object') {
      logger.warn(`FX provider returned an unexpected payload for base ${base}`);
      return null;
    }
    return data.rates as Record<string, number>;
  } catch (err) {
    logger.warn(
      `FX provider fetch failed for base ${base}: ${err instanceof Error ? err.message : err}`,
    );
    return null;
  }
}
