import { computeFederalTax } from '../config/tax-brackets-2026.js';
import { STANDARD_DEDUCTION } from '../config/constants.js';

// 2026 long-term capital gains brackets (federal) — IRS Rev. Proc. 2025-32
// Thresholds are for taxable income (after standard deduction)
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
  // Use estimated retirement withdrawal as the income proxy for LTCG bracket lookup.
  // During retirement, income drops significantly — using working gross income here
  // would overstate the cap gains drag and make brokerage projections too pessimistic.
  const taxableIncomeForCapGains = Math.max(0, estimatedAnnualWithdrawal - stdDed);
  const brackets = LTCG_BRACKETS[status];
  let federalCapGainsRate = 0.15; // default to middle tier
  for (const bracket of brackets) {
    if (taxableIncomeForCapGains <= bracket.max) {
      federalCapGainsRate = bracket.rate;
      break;
    }
  }

  // Net Investment Income Tax (NIIT): 3.8% on investment income above $200k single / $250k married
  // Use retirement withdrawal estimate — NIIT rarely applies in retirement at typical spending levels
  const niitThreshold = status === 'married' ? 250000 : 200000;
  const niitRate = estimatedAnnualWithdrawal > niitThreshold ? 0.038 : 0;

  // State rate also applies to brokerage gains in most states
  const derivedCapGainsDrag = (federalCapGainsRate + niitRate + stateRate) * 100;

  return {
    derivedRetirementTaxRate: Math.round(derivedRetirementTaxRate * 10) / 10,
    derivedCapGainsDrag: Math.round(derivedCapGainsDrag * 10) / 10,
  };
}


/**
 * Derives the investment deployment rate from the user's savings behavior.
 * Instead of a fixed magic number, we estimate what fraction of monthly surplus
 * actually gets invested based on their observed savings rate (401k + surplus / gross).
 *
 * Higher savings rates indicate more disciplined deployment; lower rates imply
 * more lifestyle drag, irregular spending, and cash sitting idle.
 *
 * Capped at 90% — even disciplined investors have irregular expenses.
 *
 *   savingsRate < 5%   → 60%
 *   5–15%              → 72%
 *   15–25%             → 82%
 *   25%+               → 90%
 */
export function deriveInvestmentRate(state, savingsMargin) {
  const gross = state.grossIncome || 1;
  // Annual 401k contribution (employee only — already being deployed)
  const annual401k = Math.min(gross * (state.deferral401k / 100), 23500);
  // Annual surplus available for brokerage (can be negative — clamp to 0 for rate calc)
  const annualSurplus = Math.max(0, (savingsMargin || 0) * 12);
  const totalSavings = annual401k + annualSurplus;
  const savingsRate = totalSavings / gross;

  let rate;
  if      (savingsRate < 0.05) rate = 60;
  else if (savingsRate < 0.15) rate = 72;
  else if (savingsRate < 0.25) rate = 82;
  else                         rate = 90;

  return rate;
}
