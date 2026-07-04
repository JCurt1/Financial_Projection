import { 
  MAX_401K_INDIVIDUAL, MAX_401K_CATCHUP_50, MAX_401K_CATCHUP_60_63, MAX_ANNUAL_ADDITIONS,
  HSA_LIMITS, STANDARD_DEDUCTION,
  SOCIAL_SECURITY_RATE, SOCIAL_SECURITY_WAGE_BASE,
  MEDICARE_RATE, ADDITIONAL_MEDICARE_RATE, ADDITIONAL_MEDICARE_THRESHOLD,
  getStateTaxRate,
} from '../config/constants.js';
import { computeFederalTax } from '../config/tax-brackets-2026.js';

// Shared FICA formula (Social Security + Medicare + Additional Medicare surtax).
// Exported so the multi-year wealth simulation can compute FICA correctly for
// grown salaries instead of proportionally scaling a single base-year number
// (proportional scaling breaks once income crosses the Additional Medicare
// threshold, since that portion of the tax is not linear in gross income).
//
// preFicaExclusions: dollars excluded from the FICA wage base — i.e. pre-tax
// HSA contributions and health insurance premiums run through a Section 125
// cafeteria plan. These reduce wages for FICA purposes just like they do for
// federal income tax. Traditional 401(k) deferrals are deliberately NOT
// included here — elective retirement deferrals are still subject to FICA
// even though they're excluded from federal taxable income.
export function computeAnnualFica(gross, status, preFicaExclusions = 0) {
  const ficaWageBase = Math.max(0, gross - preFicaExclusions);
  const ssWages = Math.min(ficaWageBase, SOCIAL_SECURITY_WAGE_BASE);
  const annualSocialSecurity = ssWages * SOCIAL_SECURITY_RATE;
  const annualMedicare = ficaWageBase * MEDICARE_RATE
    + Math.max(0, ficaWageBase - ADDITIONAL_MEDICARE_THRESHOLD[status]) * ADDITIONAL_MEDICARE_RATE;
  return annualSocialSecurity + annualMedicare;
}

export function computeTax(state) {
  const gross = state.grossIncome;
  const status = state.filingStatus === 'married' ? 'married' : 'single';

  // 1. 401(k) limits — catch-up contributions apply at age 50+
  // Age 60–63: SECURE 2.0 super catch-up ($35,750); Age 50–59 and 64+: standard catch-up ($32,500)
  const filerAge = state.initialAge || 0;
  let max401kAllowed;
  if (filerAge >= 60 && filerAge <= 63) {
    max401kAllowed = MAX_401K_CATCHUP_60_63;
  } else if (filerAge >= 50) {
    max401kAllowed = MAX_401K_CATCHUP_50;
  } else {
    max401kAllowed = MAX_401K_INDIVIDUAL;
  }

  const maxHsaAllowed = status === 'married' ? HSA_LIMITS.married : HSA_LIMITS.single;

  // 2. Total 401(k) deferral
  let total401kDeferral = gross * (state.deferral401k / 100);
  total401kDeferral = Math.min(total401kDeferral, max401kAllowed);

  // 3. Traditional vs Roth split
  const tradRatio = (state.futureTradSplitPercent ?? 50) / 100;
  const traditional401k = total401kDeferral * tradRatio;
  const roth401k = total401kDeferral - traditional401k;

  // 4. HSA
  const annualHsaInput = (state.hsaCostMonthly ?? 0) * 12;
  const traditionalHsa = Math.min(annualHsaInput, maxHsaAllowed);

  // 5. Federal taxable income — user enters combined household gross for married filers.
  // Pre-tax deductions (401k, HSA, health) are applied against the full gross.
  const preTaxHealth = state.healthCostMonthly * 12;
  let taxableIncome = gross - traditional401k - traditionalHsa - preTaxHealth - STANDARD_DEDUCTION[status];
  if (taxableIncome < 0) taxableIncome = 0;

  // 6. Federal income tax on household taxable income
  const annualFederalTax = computeFederalTax(taxableIncome, status);

  // 7 & 8. FICA — Social Security (capped at wage base) + Medicare (1.45% uncapped
  // + 0.9% additional above filing-status threshold: $200k single / $250k MFJ).
  // Wage base excludes pre-tax HSA and health premium contributions (Section 125).
  const annualFica = computeAnnualFica(gross, status, traditionalHsa + preTaxHealth);

  // 9. State income tax
  // No-income-tax states are zeroed here regardless of stateTaxRate input.
  const stateTaxRate = getStateTaxRate(state);
  const annualStateTax = gross * stateTaxRate;

  // 10. Employer match: matchRate% on contributions up to matchCeiling% of salary
  const matchRate    = (state.employerMatchRate    ?? 100) / 100;
  const matchCeiling = (state.employerMatchCeiling ?? 4)   / 100;
  const effectiveDeferralForMatch = Math.min(state.deferral401k / 100, matchCeiling);
  let annualEmployerMatchDollars = gross * effectiveDeferralForMatch * matchRate;

  // IRC §415(c) combined limit: employee (non-catch-up) deferrals + employer
  // contributions can't exceed MAX_ANNUAL_ADDITIONS. Catch-up dollars are exempt
  // and stack on top. If the match would push the total over the limit, the
  // match itself is what gets trimmed (the employee's deferral election doesn't
  // change; the employer simply can't contribute past the cap).
  const catchUpContribution   = Math.max(0, total401kDeferral - MAX_401K_INDIVIDUAL);
  const nonCatchUpDeferral    = total401kDeferral - catchUpContribution;
  const employerMatchRoom415c = Math.max(0, MAX_ANNUAL_ADDITIONS - nonCatchUpDeferral);
  annualEmployerMatchDollars   = Math.min(annualEmployerMatchDollars, employerMatchRoom415c);

  // 11. Monthly take-home
  const monthlyGross             = gross / 12;
  const monthlyFederal           = annualFederalTax / 12;
  const monthlyFica              = annualFica / 12;
  const monthlyStateTax          = annualStateTax / 12;
  const monthlyEmployee401k      = total401kDeferral / 12;
  const monthlyHsa               = traditionalHsa / 12;
  const monthlyHealth            = state.healthCostMonthly;

  const baseTakehome = monthlyGross
    - monthlyFederal
    - monthlyFica
    - monthlyStateTax
    - monthlyEmployee401k
    - monthlyHsa
    - monthlyHealth;

  // Combined monthly tax display (federal + FICA + state)
  const monthlyTax = monthlyFederal + monthlyFica + monthlyStateTax;

  const maxedOut401k = total401kDeferral >= max401kAllowed;

  return {
    traditional401k,
    roth401k,
    traditionalHsa,
    monthlyTax,
    monthlyFederal,
    monthlyFica,
    monthlyStateTax,
    baseTakehome,
    maxedOut401k,
    totalInflowEmployer401k: annualEmployerMatchDollars + total401kDeferral,
  };
}
