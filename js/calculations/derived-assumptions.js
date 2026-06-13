import { computeFederalTax } from '../config/tax-brackets-2026.js';
import { STANDARD_DEDUCTION, estimateSsAnnualBenefit, SS_FULL_RETIREMENT_AGE } from '../config/constants.js';

// 2026 long-term capital gains brackets (federal) — IRS Rev. Proc. 2025-32
// Thresholds are for taxable income (after standard deduction).
// LTCG rate is determined by WHERE your total ordinary income + LTCG stacks into these tiers.
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

// IRS Social Security combined income thresholds for benefit taxability.
// Combined income = AGI + nontaxable interest + 50% of SS benefit.
// Below base: 0% of SS is taxable.
// Base to ceiling: up to 50% of SS is taxable.
// Above ceiling: up to 85% of SS is taxable.
const SS_TAXABILITY = {
  single:  { base: 25000, ceiling: 34000 },
  married: { base: 32000, ceiling: 44000 },
};

/**
 * Estimates what fraction of SS benefits are taxable given ordinary income in retirement.
 * Returns a value between 0 and 0.85.
 */
function ssTaxableFraction(ordinaryIncome, ssAnnualBenefit, status) {
  const { base, ceiling } = SS_TAXABILITY[status];
  // Combined income = ordinary income (excl SS) + 50% of SS
  const combinedIncome = ordinaryIncome + ssAnnualBenefit * 0.5;
  if (combinedIncome <= base)    return 0;
  if (combinedIncome <= ceiling) return 0.50;
  return 0.85;
}

/**
 * Derives retirementTaxRate and capitalGainsDrag from the user's actual inputs.
 *
 * Key improvements over a naive approach:
 *  1. Expenses are inflated forward to retirement age — not today's spending.
 *  2. SS benefit taxability is modeled using the IRS combined income test.
 *  3. Cap gains drag uses stacked ordinary income (trad withdrawals + taxable SS)
 *     to find the correct LTCG bracket, rather than looking it up in isolation.
 */
export function deriveRetirementAssumptions(state) {
  const status = state.filingStatus === 'married' ? 'married' : 'single';
  const stdDed = STANDARD_DEDUCTION[status];

  // --- 1. Inflate expenses to retirement age ---
  const yearsToRetirement   = Math.max(0, (state.targetHorizonAge || 65) - (state.initialAge || 31));
  const expenseGrowthRate   = (state.annualExpenseGrowth ?? 2) / 100;
  const inflatedMonthlyExp  = (state.monthlyExpenses || 3000) * Math.pow(1 + expenseGrowthRate, yearsToRetirement);
  const estimatedAnnualWithdrawal = inflatedMonthlyExp * 12;

  // --- 2. SS benefit at retirement salary ---
  const salaryGrowthRate   = (state.annualSalaryGrowth ?? 2) / 100;
  const salaryAtRetirement = state.grossIncome * Math.pow(1 + salaryGrowthRate, yearsToRetirement);
  const retirementAge      = state.targetHorizonAge || 65;
  // SS benefit only applies if retirement age >= SS full retirement age
  const ssApplies          = retirementAge >= SS_FULL_RETIREMENT_AGE;
  const ssAnnualBenefit    = ssApplies ? estimateSsAnnualBenefit(salaryAtRetirement) : 0;

  // --- 3. Net portfolio withdrawal needed (expenses minus SS) ---
  const netWithdrawal = Math.max(0, estimatedAnnualWithdrawal - ssAnnualBenefit);

  // --- 4. SS taxability — how much of the SS benefit is taxable ordinary income ---
  // Ordinary income before SS = net withdrawal (the traditional 401k portion drives this)
  const taxableSsFraction  = ssTaxableFraction(netWithdrawal, ssAnnualBenefit, status);
  const taxableSsIncome    = ssAnnualBenefit * taxableSsFraction;

  // Total ordinary income in a typical retirement year
  const totalOrdinaryIncome = netWithdrawal + taxableSsIncome;

  // --- 5. Retirement Tax Rate ---
  // Federal tax on total ordinary income (net withdrawal + taxable SS), less standard deduction
  const taxableOrdinary    = Math.max(0, totalOrdinaryIncome - stdDed);
  const federalTaxOrdinary = computeFederalTax(taxableOrdinary, status);

  // State tax: no-income-tax states are zeroed regardless of input
  const noIncomeTaxStates = ['FL', 'TX', 'TN', 'WA', 'NV', 'AK', 'SD', 'WY', 'NH'];
  const stateRate = noIncomeTaxStates.includes(state.stateCode)
    ? 0
    : (state.stateTaxRate ?? 0) / 100;
  const stateTaxOrdinary = totalOrdinaryIncome * stateRate;

  const totalTax = federalTaxOrdinary + stateTaxOrdinary;
  // Effective rate expressed as a fraction of the gross portfolio withdrawal
  // (not total income — this is what the drawdown simulation uses as the gross-up factor)
  const derivedRetirementTaxRate = netWithdrawal > 0
    ? (totalTax / netWithdrawal) * 100
    : 0;

  // --- 6. Cap Gains Drag — stacked income approach ---
  // LTCG rate depends on where your TOTAL income (ordinary + capital gains) sits in the brackets.
  // We stack ordinary taxable income first, then find the marginal LTCG rate at that stack level.
  // This prevents misclassification into the 0% bracket when ordinary income already fills it.
  const ordinaryTaxableStack = Math.max(0, totalOrdinaryIncome - stdDed);
  const brackets = LTCG_BRACKETS[status];
  let federalCapGainsRate = 0.15; // safe default
  for (const bracket of brackets) {
    if (ordinaryTaxableStack < bracket.max) {
      federalCapGainsRate = bracket.rate;
      break;
    }
  }

  // NIIT: 3.8% on net investment income above $200k single / $250k married
  const niitThreshold = status === 'married' ? 250000 : 200000;
  const niitRate = totalOrdinaryIncome > niitThreshold ? 0.038 : 0;

  const derivedCapGainsDrag = (federalCapGainsRate + niitRate + stateRate) * 100;

  return {
    derivedRetirementTaxRate: Math.round(derivedRetirementTaxRate * 10) / 10,
    derivedCapGainsDrag:      Math.round(derivedCapGainsDrag      * 10) / 10,
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
  const annual401k    = Math.min(gross * (state.deferral401k / 100), 23500);
  const annualSurplus = Math.max(0, (savingsMargin || 0) * 12);
  const totalSavings  = annual401k + annualSurplus;
  const savingsRate   = totalSavings / gross;

  let rate;
  if      (savingsRate < 0.05) rate = 60;
  else if (savingsRate < 0.15) rate = 72;
  else if (savingsRate < 0.25) rate = 82;
  else                         rate = 90;

  return rate;
}
