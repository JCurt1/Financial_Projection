import { 
  MAX_401K_INDIVIDUAL, HSA_LIMITS, STANDARD_DEDUCTION,
  SOCIAL_SECURITY_RATE, SOCIAL_SECURITY_WAGE_BASE,
  MEDICARE_RATE, ADDITIONAL_MEDICARE_RATE, ADDITIONAL_MEDICARE_THRESHOLD,
} from '../config/constants.js';
import { computeFederalTax } from '../config/tax-brackets-2026.js';

export function computeTax(state) {
  const gross = state.grossIncome;
  const status = state.filingStatus === 'married' ? 'married' : 'single';

  // 1. 401(k) limits
  const max401kAllowed = state.spouseWorking && status === 'married'
    ? MAX_401K_INDIVIDUAL * 2
    : MAX_401K_INDIVIDUAL;

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

  // 5. Federal taxable income
  const preTaxHealth = state.healthCostMonthly * 12;
  let taxableIncome = gross - traditional401k - traditionalHsa - preTaxHealth - STANDARD_DEDUCTION[status];
  if (taxableIncome < 0) taxableIncome = 0;

  // 6. Federal income tax
  const annualFederalTax = computeFederalTax(taxableIncome, status);

  // 7. FICA — Social Security (6.2% up to wage base)
  const ssWages = Math.min(gross, SOCIAL_SECURITY_WAGE_BASE);
  const annualSocialSecurity = ssWages * SOCIAL_SECURITY_RATE;

  // 8. Medicare (1.45% uncapped + 0.9% additional above threshold)
  const additionalMedicareThreshold = ADDITIONAL_MEDICARE_THRESHOLD[status];
  const annualMedicare = gross * MEDICARE_RATE
    + Math.max(0, gross - additionalMedicareThreshold) * ADDITIONAL_MEDICARE_RATE;

  const annualFica = annualSocialSecurity + annualMedicare;

  // 9. State income tax — flat rate applied to gross (simplified; most states exempt retirement contributions)
  const stateTaxRate = (state.stateTaxRate ?? 0) / 100;
  const annualStateTax = gross * stateTaxRate;

  // 10. Employer match
  const effectiveMatchPercent = Math.min(state.deferral401k, state.employerMatch || 0);
  const annualEmployerMatchDollars = gross * (effectiveMatchPercent / 100);

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
