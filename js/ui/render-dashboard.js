import { renderNetworthBar } from './networth-bar.js';
import { renderCashflowSummary } from './cashflow-summary.js';
import { renderTimeline } from './timeline.js';
import { renderDebtDiagnostics } from './debt-diagnostics.js';
import { renderFIDiagnostics } from './fi-diagnostics.js';
import { renderHealthMetrics } from './health-metrics.js';
import { renderProjector } from './projector.js';
import { renderMonteCarloDiagnostics } from './monte-carlo-diagnostics.js';
import { updateGrowthChart } from './charts/growth-chart.js';
import { updateDrawdownChart } from './charts/drawdown-chart.js';
import { updateAssetDonut } from './charts/asset-donut.js';
import { updateMonteCarloChart } from './charts/monte-carlo-chart.js'; // 1. IMPORT THE NEW CHART ENGINE

export function renderDashboard(result) {
  renderNetworthBar(result);
  renderCashflowSummary(result);
  renderTimeline(result);
  renderDebtDiagnostics(result);
  renderFIDiagnostics(result);
  renderHealthMetrics(result);
  renderProjector(result);
  renderMonteCarloDiagnostics(result); 

  updateGrowthChart(result.simulation);
  updateDrawdownChart(result.simulation.drawdownTimelineData);
  updateAssetDonut(result.state);
  
  // 2. TRIGGER THE RE-DRAW AND PASS THE CALCULATED ARRAYS
  if (result.monteCarlo) {
    updateMonteCarloChart(result.state, result.monteCarlo);
  }
}
