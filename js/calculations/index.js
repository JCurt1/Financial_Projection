import { computeBalanceSheet } from './balance-sheet.js';
import { computeTax } from './tax.js';
import { computeCashflow } from './cashflow.js';
import { computeDebtPaydown } from './debt-paydown.js';
import { computeEmergencyRunway } from './emergency-runway.js';
import { computeFITargets } from './fi-targets.js';
import { simulateWealth } from './wealth-simulation.js';
import { simulateDrawdown } from './retirement-drawdown.js';
import { DEFAULT_TARGET_HORIZON_AGE } from '../config/constants.js'; // Ensure this fallback is imported

/**
 * ComputedResult — single object passed to all UI renderers.
 * calculations/* must stay pure (no DOM). UI modules read slices of this shape.
 */
export function computeAll(state) {
  // Extract target retirement age from state, falling back cleanly if it's missing
  const targetAge = state.targetHorizonAge || DEFAULT_TARGET_HORIZON_AGE;

  const balanceSheet = computeBalanceSheet(state);
  const tax = computeTax(state);
  const cashflow = computeCashflow(state, tax);
  const debt = computeDebtPaydown(state, cashflow.savingsMargin);
  const runway = computeEmergencyRunway(state, cashflow, debt);
  const fi = computeFITargets(state, balanceSheet);
  
  // 1. Pass state to wealth projection (make sure it reads dynamically internally)
  const simulation = simulateWealth(state, { tax, cashflow, debt, runway, fi });
  
  // 2. Pass the dynamic target age into the drawdown simulation function
  const drawdown = simulateDrawdown(simulation.terminalNW, targetAge);

  const homeEquity = state.homeValue - state.mortgage;
  const debtToAssetPct = balanceSheet.totalAssets > 0
    ? (balanceSheet.totalLiabilities / balanceSheet.totalAssets) * 100
    : 0;

  return {
    balanceSheet,
    tax,
    cashflow,
    debt,
    runway,
    fi,
    simulation: {
      ...simulation,
      targetHorizonAge: targetAge // Explicitly pass it forward so renderers like projector.js can see it
    },
    drawdown,
    metrics: { homeEquity, debtToAssetPct },
    state,
  };
}
