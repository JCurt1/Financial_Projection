import { 
  MAX_401K_INDIVIDUAL, MAX_401K_CATCHUP_50, MAX_401K_CATCHUP_60_63,
  HSA_LIMITS, STANDARD_DEDUCTION,
  SOCIAL_SECURITY_RATE, SOCIAL_SECURITY_WAGE_BASE,
  MEDICARE_RATE, ADDITIONAL_MEDICARE_RATE, ADDITIONAL_MEDICARE_THRESHOLD,
} from '../config/constants.js';
import { computeFederalTax } from '../config/tax-brackets-2026.js';

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

  // 7. FICA — assessed on full gross (household income entered by user)
  const ssWages = Math.min(gross, SOCIAL_SECURITY_WAGE_BASE);
  const annualSocialSecurity = ssWages * SOCIAL_SECURITY_RATE;

  // 8. Medicare (1.45% uncapped + 0.9% additional above $200k per-person threshold)
  const annualMedicare = gross * MEDICARE_RATE
    + Math.max(0, gross - ADDITIONAL_MEDICARE_THRESHOLD.single) * ADDITIONAL_MEDICARE_RATE;

  const annualFica = annualSocialSecurity + annualMedicare;

  // 9. State income tax
  // No-income-tax states are zeroed here regardless of stateTaxRate input.
  const stateTaxRate=['FL','TX','TN','WA','NV','AK','SD','WY','NH'].includes(state.stateCode)?0:(state.stateTaxRate??0)/100;
  const annualStateTax = gross * stateTaxRate;

  // 10. Employer match: matchRate% on contributions up to matchCeiling% of salary
  const matchRate    = (state.employerMatchRate    ?? 100) / 100;
  const matchCeiling = (state.employerMatchCeiling ?? 4)   / 100;
  const effectiveDeferralForMatch = Math.min(state.deferral401k / 100, matchCeiling);
  const annualEmployerMatchDollars = gross * effectiveDeferralForMatch * matchRate;

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
