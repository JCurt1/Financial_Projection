import { 
  MAX_401K_INDIVIDUAL, HSA_LIMITS, STANDARD_DEDUCTION,
  SOCIAL_SECURITY_RATE, SOCIAL_SECURITY_WAGE_BASE,
  MEDICARE_RATE, ADDITIONAL_MEDICARE_RATE, ADDITIONAL_MEDICARE_THRESHOLD,
} from '../config/constants.js';
import { computeFederalTax } from '../config/tax-brackets-2026.js';

export function computeTax(state) {
  const gross = state.grossIncome;
  const status = state.filingStatus === 'married' ? 'married' : 'single';
  const householdIncome = gross + (status === 'married' ? (state.spouseIncome || 0) : 0);

  // 1. 401(k) limits
  const max401kAllowed = MAX_401K_INDIVIDUAL;

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

  // 5. Federal taxable income — MFJ files jointly so spouse income shifts the bracket.
  // Pre-tax deductions (401k, HSA, health) are primary-filer-only; spouse's are on their own paycheck.
  const spouseGross = (status === 'married' && state.spouseWorking) ? (state.spouseIncome || 0) : 0;
  const preTaxHealth = state.healthCostMonthly * 12;
  let taxableIncome = (gross + spouseGross) - traditional401k - traditionalHsa - preTaxHealth - STANDARD_DEDUCTION[status];
  if (taxableIncome < 0) taxableIncome = 0;

  // 6. Federal income tax — computed on joint income, pro-rated back to primary filer by income share.
  // Spouse's share accounted for separately via spouseNetMonthly below.
  const annualFederalTaxJoint = computeFederalTax(taxableIncome, status);
  const primaryFilerShareFraction = householdIncome > 0 ? gross / householdIncome : 1;
  const annualFederalTax = annualFederalTaxJoint * primaryFilerShareFraction;
  const annualFederalTaxSpouse = annualFederalTaxJoint * (1 - primaryFilerShareFraction);

  // 7. FICA — per-paycheck, per-person. Primary filer only here; spouse computed separately.
  const ssWages = Math.min(gross, SOCIAL_SECURITY_WAGE_BASE);
  const annualSocialSecurity = ssWages * SOCIAL_SECURITY_RATE;

  // 8. Medicare (1.45% uncapped + 0.9% additional above threshold)
  const additionalMedicareThreshold = ADDITIONAL_MEDICARE_THRESHOLD[status];
  const annualMedicare = gross * MEDICARE_RATE
    + Math.max(0, gross - additionalMedicareThreshold) * ADDITIONAL_MEDICARE_RATE;

  const annualFica = annualSocialSecurity + annualMedicare;

  // 9. State income tax — primary filer's gross only (spouse pays their own state tax).
  // No-income-tax states are zeroed here regardless of stateTaxRate input.
  // This list must stay in sync with derived-assumptions.js (noIncomeTaxStates) and the UI dropdown optgroup.
  const stateTaxRate=['FL','TX','TN','WA','NV','AK','SD','WY','NH'].includes(state.stateCode)?0:(state.stateTaxRate??0)/100;
  const annualStateTax = gross * stateTaxRate;

  // 10. Employer match: matchRate% on contributions up to matchCeiling% of salary
  const matchRate    = (state.employerMatchRate    ?? 100) / 100;
  const matchCeiling = (state.employerMatchCeiling ?? 4)   / 100;
  const effectiveDeferralForMatch = Math.min(state.deferral401k / 100, matchCeiling);
  const annualEmployerMatchDollars = gross * effectiveDeferralForMatch * matchRate;

  // 11. Spouse net monthly contribution to household cash flow.
  // Subtracts spouse's pro-rated federal tax share, FICA, and state tax.
  // No 401k or health deductions modeled for spouse (unknown, conservative).
  let spouseNetMonthly = 0;
  if (spouseGross > 0) {
    const spouseFica = (Math.min(spouseGross, SOCIAL_SECURITY_WAGE_BASE) * SOCIAL_SECURITY_RATE)
      + (spouseGross * MEDICARE_RATE)
      + (Math.max(0, spouseGross - ADDITIONAL_MEDICARE_THRESHOLD[status]) * ADDITIONAL_MEDICARE_RATE);
    const spouseStateTax = spouseGross * stateTaxRate;
    spouseNetMonthly = (spouseGross - annualFederalTaxSpouse - spouseFica - spouseStateTax) / 12;
  }

  // 12. Monthly take-home — primary filer's paycheck + spouse net household contribution
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
    - monthlyHealth
    + spouseNetMonthly;

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
