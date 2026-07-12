import { FI_MULTIPLIER, COAST_FI_REFERENCE_AGE, MEDICARE_ELIGIBILITY_AGE, PRE_MEDICARE_HEALTH_COST_MONTHLY, MEDICARE_HEALTH_COST_MONTHLY } from '../config/constants.js';

export function computeFITargets(state, balanceSheet) {
  const annualExpenses = (state.monthlyExpenses || 1) * 12;

  // The real drawdown simulation adds a real health insurance cost on top of monthlyExpenses
  // (pre-Medicare ACA/COBRA-style cost, or Medicare Part B/D + supplemental past 65) — this
  // quick 25x-rule number previously ignored that entirely, silently assuming health
  // insurance is free forever. Using the same flat figures the real simulation uses (not
  // the full IRMAA/ACA machinery — this is meant to stay a fast, simple approximation)
  // keeps this number from understating what you actually need.
  const fiHealthCostFilingKey = state.filingStatus === 'married' ? 'married' : 'single';
  const fiRetirementAge = state.targetHorizonAge || 65;
  const annualHealthCostEstimate = (fiRetirementAge < MEDICARE_ELIGIBILITY_AGE
    ? PRE_MEDICARE_HEALTH_COST_MONTHLY[fiHealthCostFilingKey]
    : MEDICARE_HEALTH_COST_MONTHLY[fiHealthCostFilingKey]) * 12;

  const fiTargetNumber = (annualExpenses + annualHealthCostEstimate) * FI_MULTIPLIER;
  const retirementTaxFactor =
  1 - ((state.retirementTaxRate ?? 15) / 100);

const effectiveAssets =
  (state.retirement * retirementTaxFactor) +
  state.brokerage +
  state.cash +
  (state.hsaBalance || 0); const progressPct=Math.min((effectiveAssets/(fiTargetNumber||1))*100,100);

  const annualYield = state.marketYield / 100;
  const yearsRemainingTo65 = Math.max(COAST_FI_REFERENCE_AGE - state.initialAge, 0);
  const coastThreshold = fiTargetNumber / Math.pow(1 + annualYield, yearsRemainingTo65);

  // Liquid portfolio pool used for immediate coast/FI checks
  const liquidPortfolioPool =
  (state.retirement * retirementTaxFactor) +
  state.brokerage +
  (state.hsaBalance || 0) -
  state.consumerDebt;

  return {
    fiTargetNumber,
    progressPct,
    coastThreshold,
    liquidPortfolioPool,
    annualYield,
  };
}
