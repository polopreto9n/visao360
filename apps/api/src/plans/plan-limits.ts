export interface PlanLimits {
  maxUnits: number;
  maxUsers: number;
  maxAssets: number;
  maxChecklists: number;
}

export const PLAN_LIMITS: Record<string, PlanLimits> = {
  TRIAL:        { maxUnits: 1,  maxUsers: 5,   maxAssets: 30,   maxChecklists: 10 },
  STARTER:      { maxUnits: 3,  maxUsers: 15,  maxAssets: 100,  maxChecklists: 30 },
  PROFESSIONAL: { maxUnits: 15, maxUsers: 60,  maxAssets: 500,  maxChecklists: 100 },
  ENTERPRISE:   { maxUnits: -1, maxUsers: -1,  maxAssets: -1,   maxChecklists: -1  },
};

export function getLimits(plan: string): PlanLimits {
  return PLAN_LIMITS[plan] ?? PLAN_LIMITS['STARTER'];
}

export function isUnlimited(value: number): boolean {
  return value === -1;
}
