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

// States with no income tax — flat 0% regardless of any stateTaxRate input. Centralized
// here since this same list was previously duplicated in tax.js and derived-assumptions.js.
export const NO_INCOME_TAX_STATES = ['FL', 'TX', 'TN', 'WA', 'NV', 'AK', 'SD', 'WY', 'NH'];

export function getStateTaxRate(state) {
  return NO_INCOME_TAX_STATES.includes(state.stateCode) ? 0 : (state.stateTaxRate ?? 0) / 100;
}

// IRS Social Security combined-income test for federal benefit taxability.
// Combined income = ordinary income (excl. SS) + nontaxable interest + 50% of SS benefit.
// Below base: 0% of SS is federally taxable. Base–ceiling: up to 50%. Above ceiling: up to 85%.
// NOTE: this is a FEDERAL rule only. Most states with an income tax (including Michigan)
// exempt Social Security from state tax entirely — a shrinking minority (e.g. CO, CT, MN,
// MT, NM, RI, UT, VT, WV as of recent years) still tax it partially. This app's flat
// per-state rate doesn't distinguish that, so state tax below is applied only to the
// portfolio-withdrawal portion of retirement income, not the SS benefit — correct for the
// large majority of states, including Michigan specifically.
export const SS_TAXABILITY = {
  single:  { base: 25000, ceiling: 34000 },
  married: { base: 32000, ceiling: 44000 },
};

export function ssTaxableFraction(ordinaryIncome, ssAnnualBenefit, status) {
  const { base, ceiling } = SS_TAXABILITY[status];
  const combinedIncome = ordinaryIncome + ssAnnualBenefit * 0.5;
  if (combinedIncome <= base)    return 0;
  if (combinedIncome <= ceiling) return 0.50;
  return 0.85;
}

// 2026 long-term capital gains brackets (federal) — IRS Rev. Proc. 2025-32.
// Thresholds are for taxable income (after standard deduction). LTCG rate is determined
// by where your total ordinary income + LTCG stacks into these tiers.
export const LTCG_BRACKETS = {
  single:  [
    { max: 49450,   rate: 0.00 },
    { max: 545500,  rate: 0.15 },
    { max: Infinity, rate: 0.20 },
  ],
  married: [
    { max: 98900,   rate: 0.00 },
    { max: 613700,  rate: 0.15 },
    { max: Infinity, rate: 0.20 },
  ],
};

export const NIIT_RATE = 0.038;
export const NIIT_THRESHOLD = { single: 200000, married: 250000 };

// Computes the blended capital-gains rate (federal LTCG + NIIT + state) for a GIVEN year's
// actual ordinary income — not a single rate held constant across an entire drawdown
// horizon. Ordinary income (RMDs, taxable SS) shifts every year — often dropping once RMDs
// taper off in your 80s — so the LTCG bracket and NIIT exposure should be recalculated
// year by year, same as the ordinary-income tax already is, instead of frozen at whatever
// single year it happened to be computed against.
export function computeCapitalGainsRate(totalOrdinaryIncome, standardDeduction, status, state) {
  // LTCG bracket: determined by where ordinary income already stacks (post-deduction),
  // since the gain is taxed as if it sits on top of your other income.
  const ordinaryTaxableStack = Math.max(0, totalOrdinaryIncome - standardDeduction);
  const brackets = LTCG_BRACKETS[status];
  let federalCapGainsRate = 0.15; // safe default
  for (const bracket of brackets) {
    if (ordinaryTaxableStack < bracket.max) {
      federalCapGainsRate = bracket.rate;
      break;
    }
  }

  // NIIT: 3.8% on net investment income above $200k single / $250k married (pre-deduction
  // total ordinary income, per the actual NIIT MAGI test).
  const niitRate = totalOrdinaryIncome > NIIT_THRESHOLD[status] ? NIIT_RATE : 0;

  const stateRate = getStateTaxRate(state);
  return federalCapGainsRate + niitRate + stateRate;
}
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

// --- Retirement health insurance cost ---
// healthCostMonthly (the working-years payroll-deducted premium) only ever applies while
// there's an employer paycheck to deduct it from — it was previously never replaced by
// anything once retirement starts, silently modeling health insurance as free for the
// entire retirement. These are rough, unsubsidized estimates split at Medicare eligibility:
// pre-65 (ACA marketplace / COBRA — no employer subsidy anymore, so meaningfully higher
// than whatever the working-years premium was) and 65+ (Medicare Part B + Part D +
// supplemental/Medigap). Scaled by filing status as a simple stand-in for household size,
// same convention already used for the standard deduction and tax brackets.
export const MEDICARE_ELIGIBILITY_AGE = 65;
export const PRE_MEDICARE_HEALTH_COST_MONTHLY = { single: 750, married: 1500 };
export const MEDICARE_HEALTH_COST_MONTHLY     = { single: 450, married: 900 };
// Healthcare costs have historically outpaced general inflation (long-run trend closer to
// 5%/yr vs. ~3% CPI) — using a dedicated, higher rate here is the conservative choice.
export const HEALTHCARE_INFLATION_RATE = 0.05;

// --- IRMAA (Income-Related Monthly Adjustment Amount) ---
// Medicare Part B + Part D premiums aren't flat — cross certain MAGI thresholds and you
// pay meaningfully more, in tiers. This matters specifically BECAUSE of the RMD modeling
// already in this app: a large pre-tax balance forcing big RMDs in your mid-70s is exactly
// the scenario that can also push MAGI into these surcharge tiers, and until now that cost
// was invisible — the flat MEDICARE_HEALTH_COST_MONTHLY figure didn't vary with income.
//
// Approximate 2025 combined Part B + Part D surcharge, added on top of the base premium
// already included in MEDICARE_HEALTH_COST_MONTHLY. These thresholds are indexed annually
// (similar to tax brackets) — reasonably current, not exact-to-the-dollar for future years.
//
// Real IRMAA uses a 2-YEAR MAGI lookback (this year's premium is based on income from two
// years ago), not current-year income. Modeling that precisely would mean tracking a
// rolling MAGI history; instead this uses the PRIOR simulated year's MAGI as the basis for
// the current year's surcharge — which is actually a reasonably close proxy for the real
// lookback mechanic (not just current-year income), and conveniently also avoids a
// circular dependency (this year's withdrawal need would otherwise depend on this year's
// health cost, which would depend on this year's withdrawal amount).
export const IRMAA_BRACKETS = {
  single: [
    { maxMagi: 106000,  surcharge: 0 },
    { maxMagi: 133000,  surcharge: 88 },
    { maxMagi: 167000,  surcharge: 220 },
    { maxMagi: 200000,  surcharge: 353 },
    { maxMagi: 500000,  surcharge: 486 },
    { maxMagi: Infinity, surcharge: 530 },
  ],
  married: [
    { maxMagi: 212000,  surcharge: 0 },
    { maxMagi: 266000,  surcharge: 88 },
    { maxMagi: 334000,  surcharge: 220 },
    { maxMagi: 400000,  surcharge: 353 },
    { maxMagi: 750000,  surcharge: 486 },
    { maxMagi: Infinity, surcharge: 530 },
  ],
};

// Returns the monthly IRMAA surcharge (on top of base Medicare premiums) for a given MAGI.
export function computeIrmaaSurcharge(magi, status) {
  const brackets = IRMAA_BRACKETS[status] || IRMAA_BRACKETS.single;
  for (const bracket of brackets) {
    if (magi <= bracket.maxMagi) return bracket.surcharge;
  }
  return brackets[brackets.length - 1].surcharge;
}

// --- ACA Premium Tax Credit (pre-Medicare subsidy) ---
// The mirror image of IRMAA: PRE_MEDICARE_HEALTH_COST_MONTHLY was a flat, fully
// unsubsidized number, but real ACA marketplace premiums are heavily income-based — lower
// reported income means a bigger subsidy, capping what you actually pay at a percentage of
// income rather than the sticker price. This matters a lot for early retirees specifically,
// since deliberately keeping reported taxable income low in the pre-RMD years to qualify
// for larger subsidies is a common, well-known strategy this app's audience is likely to
// use — the flat-cost assumption was probably OVERSTATING pre-Medicare costs for exactly
// the people most likely to plan around this.
//
// Current law (IRA-enhanced subsidies, no hard income cliff at 400% FPL, capped at 8.5% of
// income) — this structure has changed before and its long-term future is uncertain;
// revisit if the law changes, same caveat as the tax brackets elsewhere in this app.
//
// Like IRMAA, this uses the PRIOR simulated year's MAGI as a proxy (real ACA subsidies use
// a CURRENT-year estimated income with reconciliation at tax time, not a lookback — but
// using last year's actual MAGI avoids the same circular dependency IRMAA has, and is a
// reasonable smoothing approximation for a gradually-changing retirement income trajectory).
export const ACA_FPL = { single: 15060, married: 20440 }; // 2024 guidelines (indexed annually)

// Piecewise-linear applicable-percent-of-income schedule vs. income as a ratio of FPL.
const ACA_APPLICABLE_PERCENT_POINTS = [
  { fplRatio: 0,    pct: 0 },
  { fplRatio: 1.50, pct: 0 },
  { fplRatio: 2.00, pct: 0.02 },
  { fplRatio: 2.50, pct: 0.04 },
  { fplRatio: 3.00, pct: 0.06 },
  { fplRatio: 4.00, pct: 0.085 },
];

export function computeAcaApplicablePercent(fplRatio) {
  if (fplRatio >= 4.00) return 0.085;
  for (let i = 0; i < ACA_APPLICABLE_PERCENT_POINTS.length - 1; i++) {
    const a = ACA_APPLICABLE_PERCENT_POINTS[i];
    const b = ACA_APPLICABLE_PERCENT_POINTS[i + 1];
    if (fplRatio >= a.fplRatio && fplRatio <= b.fplRatio) {
      const frac = (fplRatio - a.fplRatio) / (b.fplRatio - a.fplRatio);
      return a.pct + frac * (b.pct - a.pct);
    }
  }
  return 0.085;
}

// Caps the annual premium at whichever is LOWER: the actual unsubsidized cost, or the
// income-based percentage cap — a subsidy never makes you pay MORE than the sticker price.
export function computeAcaSubsidizedAnnualCost(unsubsidizedAnnualCost, magi, status) {
  const fpl = ACA_FPL[status] || ACA_FPL.single;
  const fplRatio = fpl > 0 ? magi / fpl : 4;
  const applicablePercent = computeAcaApplicablePercent(fplRatio);
  const incomeBasedCap = Math.max(0, applicablePercent * magi);
  return Math.min(unsubsidizedAnnualCost, incomeBasedCap);
}

// --- Long-term care risk ---
// Roughly 70% of people turning 65 will need some form of long-term care in their
// lifetime — nursing home care runs $100k+/year, and unlike health insurance (a flat cost
// nearly everyone pays every year), this is fundamentally a TAIL risk: most years cost $0,
// but a meaningful minority of retirements face a multi-year, six-figure-per-year event
// (dementia care especially can run 4+ years). A flat average add-on would flatten away
// the actual shape of that risk, so this models it two different ways:
//   - Deterministic engine: a smoothed, age-rising EXPECTED-VALUE annual cost (a single
//     line can't represent a probabilistic event, so this is the best a flat chart can do).
//   - Monte Carlo engine: a genuine discrete event per trial — each trial independently
//     rolls dice every year on whether a care episode starts, and if one does, draws a
//     random severity and duration. Some trials sail through with $0 lifetime LTC cost;
//     others get hit hard — which is what actually happens to real people, and is exactly
//     the kind of tail risk this app's Monte Carlo engine already exists to capture.
//
// These are approximate, age-banded incidence rates for planning purposes, not a precise
// actuarial table — consistent with the level of approximation already used elsewhere in
// this app (IRMAA brackets, RMD divisors, etc.).
export const LTC_EXPECTED_VALUE_ANNUAL_PROBABILITY = [
  { minAge: 65, maxAge: 74,  probability: 0.01 },
  { minAge: 75, maxAge: 84,  probability: 0.04 },
  { minAge: 85, maxAge: 200, probability: 0.12 },
];
// Lower than the expected-value table above because this is the chance of a NEW episode
// STARTING in a given year (an episode then lasts multiple years once triggered), not the
// chance of already being in one — the two tables are calibrated for different purposes.
export const LTC_ONSET_PROBABILITY = [
  { minAge: 65, maxAge: 74,  probability: 0.005 },
  { minAge: 75, maxAge: 84,  probability: 0.02 },
  { minAge: 85, maxAge: 200, probability: 0.05 },
];
export const LTC_BASE_ANNUAL_COST = 100000; // today's dollars — roughly nursing-home-level care
export const LTC_MEAN_DURATION_YEARS = 3;   // average episode length; real distribution is right-skewed

export function getLtcAnnualProbability(age, table) {
  const band = table.find(b => age >= b.minAge && age <= b.maxAge);
  return band ? band.probability : 0;
}
export const DRAWDOWN_INITIAL_WITHDRAWAL_RATE = 0.04;
export const DRAWDOWN_INFLATION_RATE = 0.03; // 3% — matches Monte Carlo inflation assumption
export const DRAWDOWN_END_AGE = 90;
export const CASH_BUFFER_YIELD = 0.045; // ~4.5% HYSA/money market rate (2026)

// --- Social Security: real AIME/bend-point benefit formula ---
// The old approach applied a tiered replacement rate to ONE year of income (salary at
// retirement), which ignores your actual earnings history entirely. Real SS benefits are
// based on Average Indexed Monthly Earnings (AIME) — your highest 35 years of wage-capped
// earnings, averaged — run through a bend-point formula. That distinction matters a lot for
// anyone whose income changed significantly over their career (lower early-career pay, a
// later jump), and for early retirees, where working fewer than 35 years means missing
// years count as ZERO in the average, not just "not counted."
//
// This app only knows your income from today forward (plus a growth rate), not your actual
// pre-app earnings history — and asking for a full career history is exactly the kind of
// extra-input burden not worth adding for most people. So earnings before today are
// back-cast from your current income using the same growth-rate assumption already used to
// project forward; it's an assumption, not real data, but it's more honest than assuming
// a flat single-year proxy or (worse) that your career started at today's salary.
export const SS_WAGE_BASE = SOCIAL_SECURITY_WAGE_BASE; // reuse the same 2026 wage base as FICA
// Monthly AIME bend points (2026) — indexed annually to the national average wage; these
// shift slightly every year, similar to tax brackets. Source: SSA benefit formula.
export const SS_BEND_POINTS = { first: 1226, second: 7391 };
export const SS_NUM_COMPUTATION_YEARS = 35;
// Assumed age SS-covered earnings began, used only to back-cast a synthetic pre-app
// earnings history — nobody's asked for their actual work-history start age.
export const SS_CAREER_START_AGE = 22;
// 8%/year credit for delaying benefits past full retirement age, up to age 70.
export const SS_DELAYED_CREDIT_PER_YEAR = 0.08;
export const SS_MAX_DELAYED_CLAIM_AGE = 70;

// Builds a synthetic year-by-year earnings history from career start to retirement:
// back-cast (career start → today) and forward-cast (today → retirement) both using the
// same salary growth rate, anchored on today's actual income.
export function buildSyntheticEarningsHistory(state) {
  const growthRate = (state.annualSalaryGrowth ?? 0) / 100;
  const currentAge = state.initialAge ?? 30;
  const retirementAge = state.targetHorizonAge || DEFAULT_TARGET_HORIZON_AGE;
  // No more SS-covered earnings once you stop working, and no benefit to counting years
  // past the max delayed-claim age either.
  const lastEarningAge = Math.min(retirementAge, SS_MAX_DELAYED_CLAIM_AGE);

  const history = [];
  for (let age = SS_CAREER_START_AGE; age < currentAge; age++) {
    const yearsBack = currentAge - age;
    history.push(Math.max(0, state.grossIncome / Math.pow(1 + growthRate, yearsBack)));
  }
  for (let age = currentAge; age < lastEarningAge; age++) {
    const yearsForward = age - currentAge;
    history.push(Math.max(0, state.grossIncome * Math.pow(1 + growthRate, yearsForward)));
  }
  return history;
}

// Converts an earnings history into an annual PIA (Primary Insurance Amount) — the
// benefit payable starting at full retirement age, before any delayed-claiming credit.
export function computeAnnualPia(earningsHistory) {
  const capped = earningsHistory.map(e => Math.min(e, SS_WAGE_BASE));
  const top35 = [...capped].sort((a, b) => b - a).slice(0, SS_NUM_COMPUTATION_YEARS);
  while (top35.length < SS_NUM_COMPUTATION_YEARS) top35.push(0); // missing years count as zero
  const aime = top35.reduce((sum, e) => sum + e, 0) / (SS_NUM_COMPUTATION_YEARS * 12);

  const { first, second } = SS_BEND_POINTS;
  let monthlyPia;
  if (aime <= first) {
    monthlyPia = aime * 0.90;
  } else if (aime <= second) {
    monthlyPia = first * 0.90 + (aime - first) * 0.32;
  } else {
    monthlyPia = first * 0.90 + (second - first) * 0.32 + (aime - second) * 0.15;
  }
  return monthlyPia * 12;
}

// Full estimate: builds the synthetic earnings history, computes PIA, and applies the
// delayed-retirement credit if the plan claims after full retirement age (this app never
// claims before full retirement age — see SS_FULL_RETIREMENT_AGE usage in the drawdown
// engines — so there's no early-claiming reduction to model).
export function estimateSsAnnualBenefit(state) {
  const history = buildSyntheticEarningsHistory(state);
  const annualPia = computeAnnualPia(history);

  const retirementAge = state.targetHorizonAge || DEFAULT_TARGET_HORIZON_AGE;
  const claimAge = Math.max(retirementAge, SS_FULL_RETIREMENT_AGE);
  const delayedYears = Math.max(0, Math.min(claimAge, SS_MAX_DELAYED_CLAIM_AGE) - SS_FULL_RETIREMENT_AGE);
  const delayedMultiplier = 1 + delayedYears * SS_DELAYED_CREDIT_PER_YEAR;

  return annualPia * delayedMultiplier;
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
