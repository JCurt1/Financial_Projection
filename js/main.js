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
// Import your new Monte Carlo chart updater
import { updateMonteCarloChart } from './ui/charts/monte-carlo-chart.js';

function run() {
  const state = getState();
  const result = computeAll(state);
  
  // 1. Updates all UI text labels and badges
  renderDashboard(result);
  
  // 2. Explicitly triggers the visual graph update with fresh data
  if (result.monteCarlo) {
    updateMonteCarloChart(state, result.monteCarlo);
  }
}

window.addEventListener('DOMContentLoaded', () => {
  initHeader();
  initTheme();
  initBalanceSheet();
  initIncomePanel();
  initDebtDiagnostics();
  initHealthMetrics();
  initProjector();

  // Initialize all charts
  createGrowthChart();
  createDrawdownChart();
  createAssetDonut(getState());

  // Subscribe to state changes so the charts react to sliders automatically
  subscribe(run);
  
  // Initial run to populate the UI on load
  run();
});
