import { computeBalanceSheet } from './balance-sheet.js';
import { computeTax } from './tax.js';
import { computeCashflow } from './cashflow.js';
import { computeDebtPaydown } from './debt-paydown.js';
import { computeEmergencyRunway } from './emergency-runway.js';
import { computeFITargets } from './fi-targets.js';
import { simulateWealth, runMonteCarloSimulation } from './wealth-simulation.js'; // Imported runMonteCarloSimulation
import { simulateDrawdown } from './retirement-drawdown.js';
import { DEFAULT_TARGET_HORIZON_AGE } from '../config/constants.js';

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
  
  // 1. Pass state to wealth projection (calculates accumulation and returns tax-split arrays)
  const simulation = simulateWealth(state, { tax, cashflow, debt, runway, fi });
  
  // 2. RUN THE MONTE CARLO RISK ENGINE AT THE RECALCULATION STEP
  // Compute actual pre-tax ratio at retirement from the first drawdown data point
  const retirementSnapshot = simulation.drawdownTimelineData?.[0];
  const preTaxRatioAtRetirement = retirementSnapshot
    ? retirementSnapshot.preTax / (retirementSnapshot.preTax + retirementSnapshot.roth + retirementSnapshot.brokerage + 0.01)
    : 0.5;
  const monteCarlo = runMonteCarloSimulation(state, simulation.terminalNW, preTaxRatioAtRetirement);
  
  // 3. Standalone drawdown chart — uses actual monthly expenses to stay consistent with wealth simulation
  const drawdown = simulateDrawdown(simulation.terminalNW, targetAge, state.monthlyExpenses);

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
    monteCarlo, // EXPORTS THE COMPLETE MATRIX OUT TO YOUR RENDER PLUGINS
    metrics: { homeEquity, debtToAssetPct },
    state,
  };
}
