import { MAX_401K, STANDARD_DEDUCTION } from '../config/constants.js';
import { computeFederalTax } from '../config/tax-brackets-2024.js';

export function computeTax(state) {
  const gross = state.grossIncome;
  let traditional401k = gross * (state.deferral401k / 100);
  traditional401k = Math.min(traditional401k, MAX_401K);
  const preTaxHealth = state.healthCostMonthly * 12;

  const standardDeduction = STANDARD_DEDUCTION[state.filingStatus] ?? STANDARD_DEDUCTION.single;
  let taxableIncome = gross - traditional401k - preTaxHealth - standardDeduction;
  if (taxableIncome < 0) taxableIncome = 0;

  const annualTax = computeFederalTax(taxableIncome, state.filingStatus);
  const monthlyTax = annualTax / 12;
  const monthlyGross = gross / 12;
  const monthly401k = traditional401k / 12;
  const monthlyHealth = state.healthCostMonthly;
  const baseTakehome = monthlyGross - monthlyTax - monthly401k - monthlyHealth;
  const maxedOut401k = traditional401k >= MAX_401K;

  return {
    traditional401k,
    monthlyTax,
    baseTakehome,
    maxedOut401k,
    totalInflowEmployer401k: (gross * (state.employerMatch / 100)) + traditional401k,
  };
}
