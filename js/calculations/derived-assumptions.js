import { computeFederalTax } from '../config/tax-brackets-2026.js';
import { STANDARD_DEDUCTION, estimateSsAnnualBenefit, SS_FULL_RETIREMENT_AGE, MAX_401K_INDIVIDUAL, MAX_401K_CATCHUP_50, MAX_401K_CATCHUP_60_63, getStateTaxRate, ssTaxableFraction, computeCapitalGainsRate } from '../config/constants.js';


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

  // --- 2. SS benefit — now a real AIME/bend-point estimate (see constants.js) ---
  const retirementAge      = state.targetHorizonAge || 65;
  // SS benefit only applies if retirement age >= SS full retirement age
  const ssApplies          = retirementAge >= SS_FULL_RETIREMENT_AGE;
  const ssAnnualBenefit    = ssApplies ? estimateSsAnnualBenefit(state) : 0;

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

  // State tax: no-income-tax states are zeroed regardless of input. Applied only to the
  // portfolio-withdrawal portion, not the SS benefit — most states with an income tax
  // (including Michigan) exempt Social Security from state tax entirely (see constants.js).
  const stateRate = getStateTaxRate(state);
  const stateTaxOrdinary = netWithdrawal * stateRate;

  const totalTax = federalTaxOrdinary + stateTaxOrdinary;
  // Effective rate expressed as a fraction of the gross portfolio withdrawal
  // (not total income — this is what the drawdown simulation uses as the gross-up factor)
  const derivedRetirementTaxRate = netWithdrawal > 0
    ? (totalTax / netWithdrawal) * 100
    : 0;

  // --- 6. Cap Gains Drag — stacked income approach ---
  // LTCG rate depends on where your TOTAL income (ordinary + capital gains) sits in the
  // brackets. Uses the same shared logic the actual drawdown engines now recalculate
  // year by year, instead of a locally duplicated copy.
  const capGainsRate = computeCapitalGainsRate(totalOrdinaryIncome, stdDed, status, state);
  const derivedCapGainsDrag = capGainsRate * 100;

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
 * Tiers reflect realistic deployment behavior at each savings level.
 * Very low margins are modeled conservatively — thin surplus is prone to
 * irregular expenses, no auto-invest setup, and cash sitting idle in checking.
 *
 *   savingsRate < 2%   → 20%  (barely positive; most surplus gets absorbed)
 *   2–5%               → 40%  (tight but intentional savers)
 *   5–15%              → 65%  (moderate savers with some discipline)
 *   15–25%             → 80%  (strong savers, likely automated)
 *   25%+               → 90%  (high savers, consistent deployment)
 */
export function deriveInvestmentRate(state, savingsMargin) {
  const gross = state.grossIncome || 1;
  const filerAge = state.initialAge || 0;
  const derivedCap = (filerAge >= 60 && filerAge <= 63) ? MAX_401K_CATCHUP_60_63
    : filerAge >= 50 ? MAX_401K_CATCHUP_50 : MAX_401K_INDIVIDUAL;
  const annual401k    = Math.min(gross * (state.deferral401k / 100), derivedCap);
  const annualSurplus = Math.max(0, (savingsMargin || 0) * 12);
  const totalSavings  = annual401k + annualSurplus;
  const savingsRate   = totalSavings / gross;

  let rate;
  if      (savingsRate < 0.02) rate = 20;
  else if (savingsRate < 0.05) rate = 40;
  else if (savingsRate < 0.15) rate = 65;
  else if (savingsRate < 0.25) rate = 80;
  else                         rate = 90;

  return rate;
}
