// Individual employee elective deferral limits (2026)
export const MAX_401K_INDIVIDUAL = 24500;
export const MAX_401K_CATCHUP_50 = 32500;    // Age 50–59 and 64+: +$8,000 catch-up
export const MAX_401K_CATCHUP_60_63 = 35750; // Age 60–63: +$11,250 super catch-up (SECURE 2.0)
// IRC §415(c): combined employee + employer annual additions limit to a single
// defined-contribution plan. Catch-up contributions (age 50+) are exempt from
// this cap — they stack on top of it, not inside it.
// NOTE: this figure is an estimate scaled from the 2025 IRS limit ($70,000) and
// has not been verified against the official 2026 Revenue Procedure — treat it
// as directionally correct, not authoritative, until confirmed.
export const MAX_ANNUAL_ADDITIONS = 72000;

// HSA Contribution Limits (Triple Tax Advantaged) — 2026 IRS official
export const HSA_LIMITS = {
  single: 4400,
  married: 8750, // Family coverage limit
};

// FICA / Payroll Tax Constants (2026)
export const SOCIAL_SECURITY_RATE = 0.062;         // 6.2% employee share
export const SOCIAL_SECURITY_WAGE_BASE = 184500;   // SS wage base cap (2026)
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
// Approximate volatility for a conservative post-retirement glide path (blended
// stock/bond allocation) — lower than a full-equity accumulation portfolio's ~15%.
// This is an assumption, not an empirically-fit figure; revisit if you model an
// explicit stock/bond glide path instead of a flat blended rate.
export const DRAWDOWN_VOLATILITY = 0.10;
export const DRAWDOWN_INITIAL_WITHDRAWAL_RATE = 0.04;
export const DRAWDOWN_INFLATION_RATE = 0.03; // 3% — matches Monte Carlo inflation assumption
export const DRAWDOWN_END_AGE = 90;
export const CASH_BUFFER_YIELD = 0.045; // ~4.5% HYSA/money market rate (2026)

// Social Security rough replacement rate — fraction of pre-retirement gross income.
// 35% is a conservative middle-ground estimate for a median earner with a full work history.
// SS eligibility starts at 62 (reduced) or 67 (full retirement age).
// Social Security tiered replacement rate — SSA bend-point model approximation.
// The SSA replaces a higher fraction of income for lower earners and a lower
// fraction for higher earners. These tiers approximate the actual SSA bend-point
// formula for a worker with a full 35-year earnings history at the given income level.
// Source: SSA benefit formula, 2026 bend points (~$1,226 / ~$7,391/mo AIME).
//
//   < $30k gross  → ~55% (low earner, high replacement)
//   $30k–$60k     → ~40% (median earner)
//   $60k–$100k    → ~32% (above-median)
//   $100k–$160k   → ~25% (higher earner)
//   > $160k       → ~20% (high earner, SS wage base caps benefit)
//
// Returns estimated annual SS benefit based on current gross income.
export function estimateSsAnnualBenefit(grossIncome) {
  let rate;
  if      (grossIncome <  30000) rate = 0.55;
  else if (grossIncome <  60000) rate = 0.40;
  else if (grossIncome < 100000) rate = 0.32;
  else if (grossIncome < 160000) rate = 0.25;
  else                           rate = 0.20;
  return grossIncome * rate;
}

export const SS_FULL_RETIREMENT_AGE = 67;

// --- Required Minimum Distributions (RMDs) ---
// SECURE 2.0 Act RMD starting age depends on birth year:
//   born 1951–1959 → age 73
//   born 1960 or later → age 75
// Source: IRS Notice 2023-54 / SECURE 2.0 Act §107. This is a structural rule
// (not an annually-indexed dollar figure like a tax bracket), so it doesn't need
// yearly upkeep — but re-verify if Congress changes RMD ages again.
export function rmdStartAge(birthYear) {
  return birthYear <= 1959 ? 73 : 75;
}

// IRS Uniform Lifetime Table III (26 CFR 1.401(a)(9)-9), in effect since 2022.
// Used by the vast majority of retirees (i.e. not the minority whose sole
// beneficiary is a spouse >10 years younger, who instead use Table II).
// RMD = prior year-end account balance / divisor for the owner's age that year.
export const RMD_DIVISORS = {
  73: 26.5, 74: 25.5, 75: 24.6, 76: 23.7, 77: 22.9, 78: 22.0, 79: 21.1,
  80: 20.2, 81: 19.4, 82: 18.5, 83: 17.7, 84: 16.8, 85: 16.0, 86: 15.2,
  87: 14.4, 88: 13.7, 89: 12.9, 90: 12.2, 91: 11.5, 92: 10.8, 93: 10.1,
  94: 9.5,  95: 8.9,  96: 8.4,  97: 7.8,  98: 7.3,  99: 6.8,  100: 6.4,
};

// Returns the RMD divisor for a given age, clamping to the table's bounds
// (the table technically continues past 100, but this projection horizon
// ends at DRAWDOWN_END_AGE / MC endAge = 90, so 100 is a safe ceiling).
export function rmdDivisorForAge(age) {
  if (age < 73) return null;
  const clampedAge = Math.min(age, 100);
  return RMD_DIVISORS[clampedAge] ?? RMD_DIVISORS[100];
}

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
