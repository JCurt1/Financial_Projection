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
      datasets: [
        {
          label: 'Liquid Portfolio',
          data: [],
          borderColor: '#2563eb',
          backgroundColor: 'rgba(37, 99, 235, 0.04)',
          borderWidth: 2,
          pointRadius: 0,
          pointHoverRadius: 5,
          fill: true,
          tension: 0.15,
        },
        {
          // Driven by mortgageRate / mortgageTermYears / homeAppreciationRate — previously
          // computed every render but never actually plotted anywhere, so those three
          // inputs had no visible effect. This line is that effect: amortization paying
          // down the mortgage plus home price appreciation, year over year.
          label: 'Home Equity',
          data: [],
          borderColor: '#d97706',
          backgroundColor: 'rgba(217, 119, 6, 0.04)',
          borderWidth: 2,
          pointRadius: 0,
          pointHoverRadius: 5,
          fill: true,
          tension: 0.15,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: true,
          position: 'top',
          align: 'end',
          labels: { color: labelColor, font: { family: 'DM Sans', size: 11 }, boxWidth: 12, usePointStyle: true },
        },
        tooltip: {
          mode: 'index',
          intersect: false,
          callbacks: {
            label(context) {
              return ' ' + context.dataset.label + ': ' + formatCurrency(context.parsed.y);
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
  charts.growthChart.data.datasets[1].data = simulation.homeEquityData;
  charts.growthChart.update();
}
