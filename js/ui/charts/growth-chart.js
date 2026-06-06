import { formatCurrency } from '../../utils/currency.js';
import { charts } from './chart-registry.js';

function getThemeColors() {
  const isDarkThemeActive = document.documentElement.getAttribute('data-theme') === 'dark';
  return {
    gridColor: isDarkThemeActive ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.04)',
    labelColor: isDarkThemeActive ? '#8b949e' : '#9aa3b5',
  };
}

export function createGrowthChart() {
  const ctxCompounding = document.getElementById('growthChart').getContext('2d');
  const { gridColor, labelColor } = getThemeColors();

  charts.growthChart = new Chart(ctxCompounding, {
    type: 'line',
    data: {
      labels: [],
      datasets: [{
        label: 'Accumulation Phase',
        data: [],
        borderColor: '#2563eb',
        backgroundColor: 'rgba(37, 99, 235, 0.04)',
        borderWidth: 2,
        pointRadius: 0,
        pointHoverRadius: 5,
        fill: true,
        tension: 0.15,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          mode: 'index',
          intersect: false,
          callbacks: {
            label(context) {
              return ' Balance: ' + formatCurrency(context.parsed.y);
            },
          },
        },
      },
      scales: {
        x: { grid: { display: false }, ticks: { color: labelColor, font: { family: 'DM Sans', size: 10 } } },
        y: {
          grid: { color: gridColor },
          ticks: {
            color: labelColor,
            font: { family: 'DM Mono', size: 10 },
            callbacks(value) { return formatCurrency(value); },
          },
        },
      },
    },
  });
}

export function updateGrowthChart(simulation) {
  if (!charts.growthChart) return;
  charts.growthChart.data.labels = simulation.growthLabels;
  charts.growthChart.data.datasets[0].data = simulation.growthData;
  charts.growthChart.update();
}
