import { MAX_401K_INDIVIDUAL, HSA_LIMITS, STANDARD_DEDUCTION } from '../config/constants.js';
import { computeFederalTax } from '../config/tax-brackets-2026.js';

export function computeTax(state) {
  const gross = state.grossIncome;
  const status = state.filingStatus === 'married' ? 'married' : 'single';
  
  // 1. Determine maximum total constraints
  const max401kAllowed = state.spouseWorking && status === 'married' 
    ? MAX_401K_INDIVIDUAL * 2 
    : MAX_401K_INDIVIDUAL;

  const maxHsaAllowed = status === 'married' ? HSA_LIMITS.married : HSA_LIMITS.single;

  // 2. Compute Base Total 401(k) Dollars
  let total401kDeferral = gross * (state.deferral401k / 100);
  total401kDeferral = Math.min(total401kDeferral, max401kAllowed);

  // 3. Process the Custom Traditional vs. Roth Split Percentage
  const tradRatio = (state.futureTradSplitPercent ?? 50) / 100;
  const traditional401k = total401kDeferral * tradRatio;
  const roth401k = total401kDeferral - traditional401k;

  // 4. Custom Manual HSA Outflows (Capped strictly at statutory maximum thresholds)
  const annualHsaInput = (state.hsaCostMonthly ?? 0) * 12;
  const traditionalHsa = Math.min(annualHsaInput, maxHsaAllowed);

  // 5. Calculate Final Taxable Income (Pre-tax health premiums, pre-tax 401k, and HSA lower your base)
  const preTaxHealth = state.healthCostMonthly * 12;
  let taxableIncome = gross - traditional401k - traditionalHsa - preTaxHealth - STANDARD_DEDUCTION[status];
  if (taxableIncome < 0) taxableIncome = 0;

  // 6. Compute Progressive Federal Taxes
  const annualTax = computeFederalTax(taxableIncome, status);
  const monthlyTax = annualTax / 12;
  
  // 7. Fix Employer Matching Logic
  const effectiveMatchPercent = Math.min(state.deferral401k, state.employerMatch || 0);
  const annualEmployerMatchDollars = gross * (effectiveMatchPercent / 100);

  // 8. Calculate Monthly Net Takehome Cash Flow
  const monthlyGross = gross / 12;
  const monthlyEmployee401kOutflow = total401kDeferral / 12;
  const monthlyHsaOutflow = traditionalHsa / 12;
  const monthlyHealth = state.healthCostMonthly;
  
  const baseTakehome = monthlyGross - monthlyTax - monthlyEmployee401kOutflow - monthlyHsaOutflow - monthlyHealth;
  const maxedOut401k = total401kDeferral >= max401kAllowed;

  return {
    traditional401k,
    roth401k,
    traditionalHsa,
    monthlyTax,
    baseTakehome,
    maxedOut401k,
    totalInflowEmployer401k: annualEmployerMatchDollars + total401kDeferral,
  };
}
