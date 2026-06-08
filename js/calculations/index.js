import { computeBalanceSheet } from './balance-sheet.js';
import { computeTax } from './tax.js';
import { computeCashflow } from './cashflow.js';
import { computeDebtPaydown } from './debt-paydown.js';
import { computeEmergencyRunway } from './emergency-runway.js';
import { computeFITargets } from './fi-targets.js';
import { simulateWealth, runMonteCarloSimulation } from './wealth-simulation.js'; // Imported runMonteCarloSimulation
import { simulateDrawdown } from './retirement-drawdown.js';
import { DEFAULT_TARGET_HORIZON_AGE } from '../config/constants.js';
import { deriveRetirementAssumptions } from './derived-assumptions.js';

/**
 * ComputedResult — single object passed to all UI renderers.
 * calculations/* must stay pure (no DOM). UI modules read slices of this shape.
 */
export function computeAll(state) {
  // Extract target retirement age from state, falling back cleanly if it's missing
  const targetAge = state.targetHorizonAge || DEFAULT_TARGET_HORIZON_AGE;

  // Derive retirementTaxRate and capitalGainsDrag from user's actual inputs
  const { derivedRetirementTaxRate, derivedCapGainsDrag } = deriveRetirementAssumptions(state);
  const enrichedState = {
    ...state,
    retirementTaxRate: derivedRetirementTaxRate,
    capitalGainsDrag: derivedCapGainsDrag,
  };

  const balanceSheet = computeBalanceSheet(enrichedState);
  const tax = computeTax(enrichedState);
  const cashflow = computeCashflow(enrichedState, tax);
  const debt = computeDebtPaydown(enrichedState, cashflow.savingsMargin);
  const runway = computeEmergencyRunway(enrichedState, cashflow, debt);
  const fi = computeFITargets(enrichedState, balanceSheet);
  
  // 1. Pass state to wealth projection (calculates accumulation and returns tax-split arrays)
  const simulation = simulateWealth(enrichedState, { tax, cashflow, debt, runway, fi });
  
  // 2. RUN THE MONTE CARLO RISK ENGINE AT THE RECALCULATION STEP
  // Compute actual pre-tax ratio at retirement from the first drawdown data point
  const retirementSnapshot = simulation.drawdownTimelineData?.[0];
  const preTaxRatioAtRetirement = retirementSnapshot
    ? retirementSnapshot.preTax / (retirementSnapshot.preTax + retirementSnapshot.roth + retirementSnapshot.brokerage + 0.01)
    : 0.5;
  const monteCarlo = runMonteCarloSimulation(enrichedState, simulation.terminalNW, preTaxRatioAtRetirement);
  
  // 3. Standalone drawdown chart — uses actual monthly expenses to stay consistent with wealth simulation
  const drawdown = simulateDrawdown(simulation.terminalNW, targetAge, enrichedState.monthlyExpenses);

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
    state: enrichedState,
    derivedRetirementTaxRate,
    derivedCapGainsDrag,
  };
}
