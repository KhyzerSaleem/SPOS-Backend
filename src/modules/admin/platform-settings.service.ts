import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  PlatformSettings,
  PlatformSettingsDocument,
} from '../../database/schemas/platform-settings.schema';
import { DEFAULT_PLATFORM_SETTINGS } from './platform-settings.defaults';
import { resolveMaintenanceState, MaintenanceState } from './maintenance.util';

@Injectable()
export class PlatformSettingsService {
  constructor(
    @InjectModel(PlatformSettings.name)
    private readonly settingsModel: Model<PlatformSettingsDocument>,
  ) {}

  async getSettings(): Promise<PlatformSettingsDocument> {
    let doc = await this.settingsModel.findOne({ key: 'platform' });
    if (!doc) {
      doc = await this.settingsModel.create(DEFAULT_PLATFORM_SETTINGS);
    }
    return doc;
  }

  async updateSettings(
    partial: Partial<PlatformSettings> | Record<string, unknown>,
  ): Promise<PlatformSettingsDocument> {
    const doc = await this.getSettings();
    const payload = { ...partial };

    if ('maintenanceScheduledStart' in payload) {
      payload.maintenanceScheduledStart = payload.maintenanceScheduledStart
        ? new Date(payload.maintenanceScheduledStart as string)
        : null;
    }
    if ('maintenanceScheduledEnd' in payload) {
      payload.maintenanceScheduledEnd = payload.maintenanceScheduledEnd
        ? new Date(payload.maintenanceScheduledEnd as string)
        : null;
    }
    const nextStart = (payload.maintenanceScheduledStart ??
      doc.maintenanceScheduledStart) as Date | null;
    const nextEnd = (payload.maintenanceScheduledEnd ?? doc.maintenanceScheduledEnd) as Date | null;
    if (nextStart && Number.isNaN(new Date(nextStart).getTime())) {
      throw new BadRequestException('Maintenance start date is invalid');
    }
    if (nextEnd && Number.isNaN(new Date(nextEnd).getTime())) {
      throw new BadRequestException('Maintenance end date is invalid');
    }
    if (nextStart && nextEnd && new Date(nextEnd).getTime() <= new Date(nextStart).getTime()) {
      throw new BadRequestException('Maintenance end date must be after start date');
    }

    const scheduleChanged =
      'maintenanceScheduledStart' in payload ||
      'maintenanceScheduledEnd' in payload ||
      'maintenanceNoticeMessage' in payload;

    if (scheduleChanged) {
      const prevStart =
        doc.maintenanceScheduledStart?.toISOString?.() ?? doc.maintenanceScheduledStart;
      const prevEnd = doc.maintenanceScheduledEnd?.toISOString?.() ?? doc.maintenanceScheduledEnd;
      const nextStartIso =
        payload.maintenanceScheduledStart instanceof Date
          ? payload.maintenanceScheduledStart.toISOString()
          : payload.maintenanceScheduledStart;
      const nextEndIso =
        payload.maintenanceScheduledEnd instanceof Date
          ? payload.maintenanceScheduledEnd.toISOString()
          : payload.maintenanceScheduledEnd;

      if (prevStart !== nextStartIso || prevEnd !== nextEndIso) {
        payload.maintenanceNotificationsSent = [];
        payload.maintenanceScheduleVersion = (doc.maintenanceScheduleVersion ?? 0) + 1;
      }
    }

    Object.assign(doc, payload);
    await doc.save();
    return doc;
  }

  async getMaintenanceState(): Promise<MaintenanceState> {
    const s = await this.getSettings();
    return resolveMaintenanceState(s.toObject());
  }

  /** Public marketing payload (no sensitive admin fields). */
  async getPublicSiteSettings() {
    const s = await this.getSettings();
    const plain = s.toObject();
    const maintenance = resolveMaintenanceState(plain);

    return {
      maintenance: {
        enabled: maintenance.active,
        upcoming: maintenance.upcoming,
        showNotice: plain.maintenanceShowNotice !== false,
        message: maintenance.message,
        estimate: maintenance.estimate,
        apologyMessage: maintenance.apologyMessage,
        noticeMessage: plain.maintenanceNoticeMessage,
        scheduledStart: maintenance.scheduledStart,
        scheduledEnd: maintenance.scheduledEnd,
        timezone: maintenance.timezone,
      },
      marketingBanner: plain.marketingBanner,
      seo: plain.seo,
      platformMatrix: plain.platformMatrix,
      productionMetrics: plain.productionMetrics,
      bentoFeatures: plain.bentoFeatures,
      solutions: plain.solutions,
      contactHighlights: plain.contactHighlights,
      trustLogos: plain.trustLogos,
      preFooterCta: plain.preFooterCta,
      updatedAt: plain.updatedAt,
    };
  }

  async isMaintenanceMode(): Promise<boolean> {
    const state = await this.getMaintenanceState();
    return state.active;
  }
}
