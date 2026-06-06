import { renderNetworthBar } from './networth-bar.js';
import { renderCashflowSummary } from './cashflow-summary.js';
import { renderTimeline } from './timeline.js';
import { renderDebtDiagnostics } from './debt-diagnostics.js';
import { renderFIDiagnostics } from './fi-diagnostics.js';
import { renderHealthMetrics } from './health-metrics.js';
import { renderProjector } from './projector.js';
import { updateGrowthChart } from './charts/growth-chart.js';
import { updateDrawdownChart } from './charts/drawdown-chart.js';
import { updateAssetDonut } from './charts/asset-donut.js';

export function renderDashboard(result) {
  renderNetworthBar(result);
  renderCashflowSummary(result);
  renderTimeline(result);
  renderDebtDiagnostics(result);
  renderFIDiagnostics(result);
  renderHealthMetrics(result);
  renderProjector(result);

  updateGrowthChart(result.simulation);
  updateDrawdownChart(result.drawdown);
  updateAssetDonut(result.state);
}
