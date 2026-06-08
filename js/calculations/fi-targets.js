import { FI_MULTIPLIER, COAST_FI_REFERENCE_AGE } from '../config/constants.js';

export function computeFITargets(state, balanceSheet) {
  const annualExpenses = (state.monthlyExpenses || 1) * 12;
  const fiTargetNumber = annualExpenses * FI_MULTIPLIER;
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
