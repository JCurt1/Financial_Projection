import { getState, subscribe } from './state/store.js';
import { computeAll } from './calculations/index.js';
import { initTheme } from './ui/theme.js';
import { initHeader } from './ui/header.js';
import { initBalanceSheet } from './ui/balance-sheet.js';
import { initIncomePanel } from './ui/income-panel.js';
import { initDebtDiagnostics } from './ui/debt-diagnostics.js';
import { initHealthMetrics } from './ui/health-metrics.js';
import { initProjector } from './ui/projector.js';
import { renderDashboard } from './ui/render-dashboard.js';
import { createGrowthChart } from './ui/charts/growth-chart.js';
import { createDrawdownChart } from './ui/charts/drawdown-chart.js';
import { createAssetDonut } from './ui/charts/asset-donut.js';

function run() {
  const result = computeAll(getState());
  renderDashboard(result);
}

window.addEventListener('DOMContentLoaded', () => {
  initHeader();
  initTheme();
  initBalanceSheet();
  initIncomePanel();
  initDebtDiagnostics();
  initHealthMetrics();
  initProjector();

  createGrowthChart();
  createDrawdownChart();
  createAssetDonut(getState());

  subscribe(run);
  run();
});
