import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type PlatformSettingsDocument = PlatformSettings & Document;

@Schema({ _id: false })
export class MarketingBanner {
  @Prop({ default: true })
  enabled: boolean;

  @Prop({ default: '' })
  text: string;

  @Prop({ default: 'Start free trial' })
  linkLabel: string;

  @Prop({ default: '/signup' })
  linkHref: string;
}

@Schema({ _id: false })
export class SeoVerification {
  /** Google Search Console verification token (content of the meta tag). */
  @Prop({ default: '' })
  google: string;

  /** Bing Webmaster Tools verification token (msvalidate.01). */
  @Prop({ default: '' })
  bing: string;
}

@Schema({ _id: false })
export class SeoOrganization {
  @Prop({ default: '' })
  legalName: string;

  /** Absolute or site-relative logo URL for Organization/publisher schema. */
  @Prop({ default: '' })
  logo: string;

  /** ISO date, e.g. 2021-01-01. */
  @Prop({ default: '' })
  foundingDate: string;

  @Prop({ default: '' })
  email: string;

  @Prop({ default: '' })
  phone: string;
}

@Schema({ _id: false })
export class SeoBusiness {
  /** LocalBusiness schema only emits when this is true AND streetAddress is set. */
  @Prop({ default: false })
  enabled: boolean;

  @Prop({ default: '' })
  streetAddress: string;

  @Prop({ default: '' })
  addressLocality: string;

  @Prop({ default: '' })
  addressRegion: string;

  @Prop({ default: '' })
  postalCode: string;

  @Prop({ default: '' })
  addressCountry: string;

  @Prop({ default: '' })
  latitude: string;

  @Prop({ default: '' })
  longitude: string;

  @Prop({ default: '' })
  priceRange: string;

  /** e.g. ["Mo-Fr 09:00-18:00"]. */
  @Prop({ type: [String], default: [] })
  openingHours: string[];
}

@Schema({ _id: false })
export class SeoSettings {
  @Prop({ default: 'SwiftPOS — Cloud POS & Retail Management' })
  title: string;

  @Prop({ default: '' })
  description: string;

  @Prop({ type: [String], default: [] })
  keywords: string[];

  @Prop({ default: '' })
  ogTitle: string;

  @Prop({ default: '' })
  ogDescription: string;

  @Prop({ default: 'SwiftPOS' })
  siteName: string;

  /**
   * Absolute origin (e.g. https://swiftpos.com) used to emit canonical URLs,
   * absolute Open Graph image URLs and sitemap entries. Without it, canonical
   * tags cannot be generated — search engines then risk indexing duplicate
   * URLs (www/non-www, trailing slash, query-string variants).
   */
  @Prop({ default: '' })
  canonicalBaseUrl: string;

  /** Absolute or site-relative OG/Twitter card image. */
  @Prop({ default: '' })
  ogImage: string;

  /** e.g. @swiftpos — used for twitter:site. */
  @Prop({ default: '' })
  twitterHandle: string;

  /** Social profile URLs (X, LinkedIn, Facebook, …) — emitted as `sameAs`. */
  @Prop({ type: [String], default: [] })
  sameAs: string[];

  @Prop({ type: SeoVerification, default: () => ({}) })
  verification: SeoVerification;

  @Prop({ type: SeoOrganization, default: () => ({}) })
  organization: SeoOrganization;

  @Prop({ type: SeoBusiness, default: () => ({}) })
  business: SeoBusiness;
}

/**
 * Per-page SEO overrides, keyed by page slug ("home", "features", "pricing",
 * "solutions", "customers", "contact"). Every field is optional and falls back
 * to the global SeoSettings above, so a page only stores what it overrides.
 */
@Schema({ _id: false })
export class PageSeo {
  @Prop({ default: '' })
  title: string;

  @Prop({ default: '' })
  description: string;

  @Prop({ type: [String], default: [] })
  keywords: string[];

  @Prop({ default: '' })
  ogTitle: string;

  @Prop({ default: '' })
  ogDescription: string;

  @Prop({ default: '' })
  ogImage: string;

  /** Exclude this page from search indexing (robots noindex). */
  @Prop({ default: false })
  noindex: boolean;
}

export const PageSeoSchema = SchemaFactory.createForClass(PageSeo);

@Schema({ _id: false })
export class MatrixModule {
  @Prop({ required: true })
  id: string;

  @Prop({ required: true })
  label: string;
}

@Schema({ _id: false })
export class MatrixRow {
  @Prop({ required: true })
  label: string;

  @Prop({ type: [String], default: [] })
  modules: string[];
}

@Schema({ _id: false })
export class MatrixCategory {
  @Prop({ required: true })
  name: string;

  @Prop({ type: [MatrixRow], default: [] })
  rows: MatrixRow[];
}

@Schema({ _id: false })
export class PlatformMatrix {
  @Prop({ type: [MatrixModule], default: [] })
  modules: MatrixModule[];

  @Prop({ type: [MatrixCategory], default: [] })
  categories: MatrixCategory[];
}

@Schema({ _id: false })
export class MetricItem {
  @Prop({ required: true })
  value: string;

  @Prop({ required: true })
  label: string;

  @Prop({ default: '' })
  detail: string;

  @Prop({ default: 'Building2' })
  icon: string;

  @Prop({ default: 'from-primary/25 to-brand-foreground/10' })
  accent: string;

  @Prop({ default: false })
  featured: boolean;
}

@Schema({ _id: false })
export class BentoItem {
  @Prop({ required: true })
  title: string;

  @Prop({ default: '' })
  desc: string;

  @Prop({ default: 'Zap' })
  icon: string;

  @Prop({ default: 'default' })
  size: string;
}

@Schema({ _id: false })
export class SolutionItem {
  @Prop({ required: true })
  title: string;

  @Prop({ default: '' })
  desc: string;

  @Prop({ default: 'Store' })
  icon: string;

  @Prop({ type: [String], default: [] })
  features: string[];
}

@Schema({ _id: false })
export class ContactHighlight {
  @Prop({ required: true })
  value: string;

  @Prop({ required: true })
  label: string;
}

@Schema({ _id: false })
export class TrustLogoItem {
  @Prop({ default: '' })
  name: string;

  @Prop({ default: '' })
  imageUrl: string;

  @Prop({ default: true })
  enabled: boolean;
}

@Schema({ _id: false })
export class TrustLogosSection {
  @Prop({ default: true })
  enabled: boolean;

  @Prop({ default: 'Trusted by modern retail teams' })
  heading: string;

  @Prop({ type: [TrustLogoItem], default: [] })
  logos: TrustLogoItem[];
}

@Schema({ _id: false })
export class PreFooterCta {
  @Prop({ default: 'Ready to modernize your retail operations?' })
  title: string;

  @Prop({ default: '' })
  subtitle: string;

  @Prop({ default: 'Start free trial' })
  primaryLabel: string;

  @Prop({ default: '/signup' })
  primaryHref: string;

  @Prop({ default: 'Talk to sales' })
  secondaryLabel: string;

  @Prop({ default: '#contact' })
  secondaryHref: string;
}

@Schema({ collection: 'platform_settings', timestamps: true })
export class PlatformSettings {
  /** Singleton key — always `platform` */
  @Prop({ required: true, unique: true, default: 'platform' })
  key: string;

  @Prop({ default: false })
  maintenanceMode: boolean;

  @Prop({ default: 'We are performing scheduled maintenance. Please check back shortly.' })
  maintenanceMessage: string;

  @Prop({ default: 'Less than 30 minutes' })
  maintenanceEstimate: string;

  @Prop({ type: Date, default: null })
  maintenanceScheduledStart: Date | null;

  @Prop({ type: Date, default: null })
  maintenanceScheduledEnd: Date | null;

  @Prop({ default: 'UTC' })
  maintenanceTimezone: string;

  @Prop({ default: true })
  maintenanceAutoEnable: boolean;

  @Prop({ default: true })
  maintenanceShowNotice: boolean;

  @Prop({
    default:
      'We apologize for the disruption to your workflow during this maintenance window. Thank you for your patience while we improve SwiftPOS.',
  })
  maintenanceApologyMessage: string;

  @Prop({
    default:
      'Upcoming scheduled maintenance — SwiftPOS will be temporarily unavailable. Please save your work before the window begins.',
  })
  maintenanceNoticeMessage: string;

  /** Tracks sent maintenance alert milestones (advance_30d, advance_7d, advance_1d, advance_1h, started, completed). */
  @Prop({ type: [String], default: [] })
  maintenanceNotificationsSent: string[];

  /** Bumped when schedule changes so notification dedup resets. */
  @Prop({ type: Number, default: 0 })
  maintenanceScheduleVersion: number;

  @Prop({ type: MarketingBanner, default: () => ({}) })
  marketingBanner: MarketingBanner;

  @Prop({ type: SeoSettings, default: () => ({}) })
  seo: SeoSettings;

  /**
   * Per-page overrides keyed by page slug; falls back to `seo` above.
   *
   * Stored as a plain object, not a Mongoose Map: `.lean()` wraps documents in
   * FlattenMaps, which rewrites Map<K,V> to Record<K,V>. A Map-typed property
   * therefore makes every lean() result structurally incompatible with
   * PlatformSettings (it broke maintenance.scheduler.ts). A Record survives
   * lean() unchanged and matches how the admin panel and buildPageMetadata
   * already read it — plain key access.
   */
  @Prop({ type: Object, default: () => ({}) })
  pageSeo: Record<string, PageSeo>;

  @Prop({ type: PlatformMatrix, default: () => ({ modules: [], categories: [] }) })
  platformMatrix: PlatformMatrix;

  @Prop({ type: [MetricItem], default: [] })
  productionMetrics: MetricItem[];

  @Prop({ type: [BentoItem], default: [] })
  bentoFeatures: BentoItem[];

  @Prop({ type: [SolutionItem], default: [] })
  solutions: SolutionItem[];

  @Prop({ type: [ContactHighlight], default: [] })
  contactHighlights: ContactHighlight[];

  @Prop({ type: TrustLogosSection, default: () => ({}) })
  trustLogos: TrustLogosSection;

  @Prop({ type: PreFooterCta, default: () => ({}) })
  preFooterCta: PreFooterCta;
}

export const PlatformSettingsSchema = SchemaFactory.createForClass(PlatformSettings);
