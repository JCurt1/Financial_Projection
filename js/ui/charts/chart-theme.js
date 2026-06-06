import { charts } from './chart-registry.js';

export function updateChartTheme(mode) {
  const isDark = mode === 'dark';
  const gridColor = isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.04)';
  const labelColor = isDark ? '#8b949e' : '#9aa3b5';

  if (charts.growthChart) {
    charts.growthChart.options.scales.x.ticks.color = labelColor;
    charts.growthChart.options.scales.y.ticks.color = labelColor;
    charts.growthChart.options.scales.y.grid.color = gridColor;
    charts.growthChart.update('none');
  }
  if (charts.drawdownChart) {
    charts.drawdownChart.options.scales.x.ticks.color = labelColor;
    charts.drawdownChart.options.scales.y.ticks.color = labelColor;
    charts.drawdownChart.options.scales.y.grid.color = gridColor;
    charts.drawdownChart.update('none');
  }
  if (charts.assetDonut) {
    charts.assetDonut.options.plugins.legend.labels.color = isDark ? '#c9d1d9' : '#0d1117';
    charts.assetDonut.update('none');
  }
}
