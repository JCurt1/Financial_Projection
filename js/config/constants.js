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
export const CASH_BUFFER_YIELD = 0.045; // ~4.5% HYSA/money market rate (2026)

export const STANDARD_DEDUCTION = {
  single: 16100,
  married: 32200,
};

// State income tax default rates (%) — effective middle-bracket estimate for a typical earner.
// No-income-tax states are 0. Taxed states use a reasonable flat/blended rate;
// users can override manually. Source: 2025 state tax schedules.
export const STATE_TAX_RATES = {
  AK: 0,   // No income tax
  FL: 0,   // No income tax
  NH: 0,   // No income tax (Interest & Dividends Tax fully repealed 2025)
  NV: 0,   // No income tax
  SD: 0,   // No income tax
  TN: 0,   // No income tax
  TX: 0,   // No income tax
  WA: 0,   // No income tax
  WY: 0,   // No income tax
  AL: 4.0,
  AR: 4.4,
  AZ: 2.5, // Flat rate
  CA: 6.0, // Effective rate; top marginal is 13.3%
  CO: 4.4, // Flat rate
  CT: 5.0,
  DC: 6.0,
  DE: 4.8,
  GA: 5.49, // Flat rate (phasing down to 4.99% by 2029)
  HI: 7.9,
  IA: 4.82,
  ID: 5.8,
  IL: 4.95, // Flat rate
  IN: 3.05, // Flat rate
  KS: 5.2,
  KY: 4.0,  // Flat rate
  LA: 3.0,
  MA: 5.0,  // Flat rate (9% on cap gains/interest)
  MD: 4.75,
  ME: 6.75,
  MI: 4.25, // Flat rate
  MN: 6.8,
  MO: 4.7,
  MS: 4.7,
  MT: 5.9,
  NC: 4.5,  // Flat rate
  ND: 1.95,
  NE: 5.2,
  NJ: 5.5,
  NM: 4.9,
  NY: 6.0,  // Effective rate; top marginal is 10.9%
  OH: 3.5,
  OK: 4.75,
  OR: 8.0,
  PA: 3.07, // Flat rate
  RI: 4.75,
  SC: 6.2,
  UT: 4.65, // Flat rate
  VA: 5.75,
  VT: 6.6,
  WI: 5.3,
  WV: 4.82,
};
