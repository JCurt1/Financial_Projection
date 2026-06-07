import { MAX_401K_INDIVIDUAL, HSA_LIMITS, STANDARD_DEDUCTION } from '../config/constants.js';
import { computeFederalTax } from './tax-brackets-2026.js';

export function computeTax(state) {
  const gross = state.grossIncome;
  const status = state.filingStatus === 'married' ? 'married' : 'single';
  
  // 1. Determine Dynamic Limits based on Household Status
  const max401kAllowed = state.spouseWorking && status === 'married' 
    ? MAX_401K_INDIVIDUAL * 2 
    : MAX_401K_INDIVIDUAL;

  const maxHsaAllowed = state.hasHsa ? HSA_LIMITS[status] : 0;
  const standardDeduction = STANDARD_DEDUCTION[status] ?? STANDARD_DEDUCTION.single;

  // 2. Compute Base Total 401(k) Elective Deferral Amount
  let total401kDeferral = gross * (state.deferral401k / 100);
  total401kDeferral = Math.min(total401kDeferral, max401kAllowed);

  // 3. Smart Tax Optimizer / Account Allocation Split
  let traditional401k = 0;
  let roth401k = 0;
  const strategy = state.strategy401k || 'optimize'; // Options: 'traditional', 'roth', 'optimize'

  if (strategy === 'traditional') {
    traditional401k = total401kDeferral;
  } else if (strategy === 'roth') {
    roth401k = total401kDeferral;
  } else {
    // 'optimize' strategy: Calculate baseline taxable income *before* 401(k) inputs
    const preTaxHealth = state.healthCostMonthly * 12;
    const hsaContribution = state.hasHsa ? maxHsaAllowed : 0;
    const baselineTaxable = gross - preTaxHealth - hsaContribution - standardDeduction;

    // 2026 Bracket optimization inflection thresholds (start of 22% marginal tier)
    const optimizationThreshold = status === 'married' ? 100800 : 50400;

    if (baselineTaxable > optimizationThreshold) {
      // High earner: Prioritize Traditional pre-tax to shelter income down to the threshold split
      traditional401k = Math.min(total401kDeferral, baselineTaxable - optimizationThreshold);
      roth401k = Math.max(0, total401kDeferral - traditional401k);
    } else {
      // Low earner: Funnel completely to Roth to maximize compounding space at discounted brackets
      roth401k = total401kDeferral;
    }
  }

  // 4. Calculate Final Taxable Income (Only traditional allocations and HSAs lower AGI)
  const preTaxHealth = state.healthCostMonthly * 12;
  const traditionalHsa = state.hasHsa ? maxHsaAllowed : 0;

  let taxableIncome = gross - traditional401k - traditionalHsa - preTaxHealth - standardDeduction;
  if (taxableIncome < 0) taxableIncome = 0;

  // 5. Compute Progressive Federal Taxes
  const annualTax = computeFederalTax(taxableIncome, status);
  const monthlyTax = annualTax / 12;
  
  // 6. Fix Employer Matching Logic (Properly cap match allocations to true caps)
  const effectiveMatchPercent = Math.min(state.deferral401k, state.employerMatch || 0);
  const annualEmployerMatchDollars = gross * (effectiveMatchPercent / 100);

  // 7. Calculate Pure Monthly Cashflow Takehome Pay
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
    // Total combined capital injected into your retirement net worth engine every year
    totalInflowEmployer401k: annualEmployerMatchDollars + traditional401k + roth401k,
  };
}
