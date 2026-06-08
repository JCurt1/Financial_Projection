// Individual employee elective deferral limits
export const MAX_401K_INDIVIDUAL = 24500; 

// HSA Contribution Limits (Triple Tax Advantaged) — 2026 IRS official
export const HSA_LIMITS = {
  single: 4400,
  married: 8750, // Family coverage limit
};

// FICA / Payroll Tax Constants (2026)
export const SOCIAL_SECURITY_RATE = 0.062;         // 6.2% employee share
export const SOCIAL_SECURITY_WAGE_BASE = 176100;   // SS wage base cap
export const MEDICARE_RATE = 0.0145;               // 1.45% uncapped
export const ADDITIONAL_MEDICARE_RATE = 0.009;     // 0.9% above threshold
export const ADDITIONAL_MEDICARE_THRESHOLD = {
  single: 200000,
  married: 250000,
};

export const FI_MULTIPLIER = 25;
export const DEFAULT_TARGET_HORIZON_AGE = 65; 
export const COAST_FI_REFERENCE_AGE = 65;
export const MAX_MONTHLY_EXPENSES = 25000;
export const MIN_AGE = 18;
export const MAX_MARKET_YIELD = 15;

export const HEALTH_TIERS = {
  single: 150,
  spouse: 450,
  family: 650,
};

export const DRAWDOWN_GROWTH_RATE = 0.05;
export const DRAWDOWN_INITIAL_WITHDRAWAL_RATE = 0.04;
export const DRAWDOWN_INFLATION_RATE = 0.03; // 3% — matches Monte Carlo inflation assumption
export const DRAWDOWN_END_AGE = 90;
export const CASH_BUFFER_YIELD = 0.02; // ~2% HYSA/money market rate on uninvested cash

export const STANDARD_DEDUCTION = {
  single: 16100,
  married: 32200,
};
