import { computeBalanceSheet } from './balance-sheet.js';
import { computeTax } from './tax.js';
import { computeCashflow } from './cashflow.js';
import { computeDebtPaydown } from './debt-paydown.js';
import { computeEmergencyRunway } from './emergency-runway.js';
import { computeFITargets } from './fi-targets.js';
import { simulateWealth } from './wealth-simulation.js';
import { simulateDrawdown } from './retirement-drawdown.js';

/**
 * ComputedResult — single object passed to all UI renderers.
 * calculations/* must stay pure (no DOM). UI modules read slices of this shape.
 */
export function computeAll(state) {
  const balanceSheet = computeBalanceSheet(state);
  const tax = computeTax(state);
  const cashflow = computeCashflow(state, tax);
  const debt = computeDebtPaydown(state, cashflow.savingsMargin);
  const runway = computeEmergencyRunway(state, cashflow, debt);
  const fi = computeFITargets(state, balanceSheet);
  const simulation = simulateWealth(state, { tax, cashflow, debt, runway, fi });
  const drawdown = simulateDrawdown(simulation.terminalNW);

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
    simulation,
    drawdown,
    metrics: { homeEquity, debtToAssetPct },
    state,
  };
}
