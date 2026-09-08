import { FEATURE_MODULES, FeatureModule } from '../../database/schemas/tenant.schema';

export const PLAN_TIERS = ['trial', 'basic', 'pro', 'enterprise'] as const;
export type PlanTier = (typeof PLAN_TIERS)[number];

export interface PlanDefinition {
  label: string;
  description: string;
  features: FeatureModule[];
  maxUsers: number;
  maxStores: number;
  maxStorageMB: number;
}

/** Fixed feature bundles — source of truth for SaaS plan access. */
export const PLAN_DEFINITIONS: Record<PlanTier, PlanDefinition> = {
  trial: {
    label: 'Trial',
    description: '14-day trial with core retail features.',
    features: ['pos', 'products', 'inventory', 'sales', 'customers', 'settings', 'billing'],
    maxUsers: 3,
    maxStores: 1,
    maxStorageMB: 100,
  },
  basic: {
    label: 'Basic',
    description: 'Essential tools for single-store retailers.',
    features: ['pos', 'products', 'inventory', 'sales', 'customers', 'settings', 'reports'],
    maxUsers: 5,
    maxStores: 1,
    maxStorageMB: 500,
  },
  pro: {
    label: 'Pro',
    description: 'Multi-store teams with purchases, suppliers, and HRM.',
    features: [
      'pos',
      'products',
      'inventory',
      'sales',
      'purchases',
      'customers',
      'suppliers',
      'hrm',
      'reports',
      'settings',
      'billing',
    ],
    maxUsers: 15,
    maxStores: 5,
    maxStorageMB: 2000,
  },
  enterprise: {
    label: 'Enterprise',
    description: 'Full platform access including finance and API.',
    features: [...FEATURE_MODULES],
    maxUsers: 999,
    maxStores: 999,
    maxStorageMB: 50000,
  },
};

/** @deprecated use PLAN_DEFINITIONS.basic.features */
export const BASIC_PLAN_FEATURES: FeatureModule[] = [...PLAN_DEFINITIONS.basic.features];

/** @deprecated use PLAN_DEFINITIONS.trial.features */
export const TRIAL_PLAN_FEATURES: FeatureModule[] = [...PLAN_DEFINITIONS.trial.features];

export function normalizePlanTier(plan?: string | null): PlanTier {
  const raw = (plan || 'basic').toLowerCase().trim();
  if (raw === 'trial') return 'trial';
  if (raw === 'pro' || raw.startsWith('pro')) return 'pro';
  if (raw === 'enterprise' || raw.includes('enterprise') || raw === 'custom') return 'enterprise';
  if (raw === 'basic' || raw === 'free' || raw === 'starter') return 'basic';
  if ((PLAN_TIERS as readonly string[]).includes(raw)) return raw as PlanTier;
  return 'basic';
}

export function getPlanFeatures(tier: PlanTier): FeatureModule[] {
  return [...PLAN_DEFINITIONS[tier].features];
}

export function getPlanLimits(tier: PlanTier) {
  const def = PLAN_DEFINITIONS[tier];
  return {
    maxUsers: def.maxUsers,
    maxStores: def.maxStores,
    maxStorageMB: def.maxStorageMB,
  };
}

/** Apply a named plan tier to tenant document fields. */
export function buildTenantPlanUpdate(plan: string) {
  const tier = normalizePlanTier(plan);
  const def = PLAN_DEFINITIONS[tier];
  return {
    plan: tier,
    featureAccess: [...def.features],
    maxUsers: def.maxUsers,
    maxStores: def.maxStores,
    maxStorageMB: def.maxStorageMB,
  };
}

/**
 * Resolve effective modules from tenant plan (primary) with legacy featureAccess fallback.
 */
export function resolveTenantFeatures(
  plan?: string | null,
  featureAccess?: string[] | null,
): string[] {
  if (featureAccess?.includes('*')) {
    return [...FEATURE_MODULES];
  }
  if (plan) {
    return getPlanFeatures(normalizePlanTier(plan));
  }
  if (featureAccess && featureAccess.length > 0) {
    return featureAccess;
  }
  return getPlanFeatures('basic');
}

export function tenantHasFeatureAccess(
  plan: string | undefined | null,
  featureAccess: string[] | undefined | null,
  feature: string,
): boolean {
  return resolveTenantFeatures(plan, featureAccess).includes(feature);
}

export function isProOrEnterprise(plan?: string | null): boolean {
  const tier = normalizePlanTier(plan);
  return tier === 'pro' || tier === 'enterprise';
}

export function getPlanTiersForApi() {
  return PLAN_TIERS.map((tier) => ({
    tier,
    label: PLAN_DEFINITIONS[tier].label,
    description: PLAN_DEFINITIONS[tier].description,
    modules: PLAN_DEFINITIONS[tier].features,
    maxUsers: PLAN_DEFINITIONS[tier].maxUsers,
    maxStores: PLAN_DEFINITIONS[tier].maxStores,
    maxStorageMB: PLAN_DEFINITIONS[tier].maxStorageMB,
  }));
}
