import { computeFederalTax } from '../config/tax-brackets-2026.js';
import { STANDARD_DEDUCTION } from '../config/constants.js';

// 2026 long-term capital gains brackets (federal) — IRS Rev. Proc. 2025-32
// Thresholds are for taxable income (after standard deduction)
// 2026 LTCG thresholds — IRS Rev. Proc. 2025-32
const LTCG_BRACKETS = {
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

/**
 * Derives retirementTaxRate and capitalGainsDrag from the user's actual inputs
 * rather than requiring manual entry.
 *
 * retirementTaxRate — effective (not marginal) federal + state tax rate on a
 *   "typical" retirement year withdrawal from a traditional 401k/IRA.
 *   We use monthlyExpenses * 12 as the estimated annual withdrawal, which is
 *   the same number the drawdown simulation uses.
 *
 * capitalGainsDrag — blended effective rate that reduces brokerage returns,
 *   combining federal long-term capital gains rate + state income tax rate.
 *   We assume brokerage gains are realized at the long-term rate.
 */
export function deriveRetirementAssumptions(state) {
  const status = state.filingStatus === 'married' ? 'married' : 'single';
  const stdDed = STANDARD_DEDUCTION[status];

  // --- Retirement Tax Rate ---
  // Estimate annual withdrawal = current monthly expenses * 12 (inflation-adjusted spending)
  const estimatedAnnualWithdrawal = (state.monthlyExpenses || 3000) * 12;

  // Standard deduction reduces taxable income first
  const taxableWithdrawal = Math.max(0, estimatedAnnualWithdrawal - stdDed);
  const federalTaxOnWithdrawal = computeFederalTax(taxableWithdrawal, status);

  // State tax on the full withdrawal (same no-income-tax states)
  const noIncomeTaxStates = ['FL', 'TX', 'TN', 'WA', 'NV', 'AK', 'SD', 'WY', 'NH'];
  const stateRate = noIncomeTaxStates.includes(state.stateCode)
    ? 0
    : (state.stateTaxRate ?? 0) / 100;
  const stateTaxOnWithdrawal = estimatedAnnualWithdrawal * stateRate;

  const totalTax = federalTaxOnWithdrawal + stateTaxOnWithdrawal;
  // Effective rate = total tax / gross withdrawal (before deduction)
  const derivedRetirementTaxRate = estimatedAnnualWithdrawal > 0
    ? (totalTax / estimatedAnnualWithdrawal) * 100
    : 0;

  // --- Capital Gains Drag ---
  // Use current gross income as a proxy for retirement brokerage income level.
  // In reality this would be lower in retirement, but it's a conservative estimate.
  // Long-term cap gains rate is based on total taxable income.
  const taxableIncomeForCapGains = Math.max(0, (state.grossIncome || 0) - stdDed);
  const brackets = LTCG_BRACKETS[status];
  let federalCapGainsRate = 0.15; // default to middle tier
  for (const bracket of brackets) {
    if (taxableIncomeForCapGains <= bracket.max) {
      federalCapGainsRate = bracket.rate;
      break;
    }
  }

  // Net Investment Income Tax (NIIT): 3.8% on investment income above $200k single / $250k married
  const niitThreshold = status === 'married' ? 250000 : 200000;
  const niitRate = (state.grossIncome || 0) > niitThreshold ? 0.038 : 0;

  // State rate also applies to brokerage gains in most states
  const derivedCapGainsDrag = (federalCapGainsRate + niitRate + stateRate) * 100;

  return {
    derivedRetirementTaxRate: Math.round(derivedRetirementTaxRate * 10) / 10,
    derivedCapGainsDrag: Math.round(derivedCapGainsDrag * 10) / 10,
  };
}
