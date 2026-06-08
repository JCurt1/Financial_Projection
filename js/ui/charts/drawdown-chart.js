import { formatCurrency } from '../../utils/currency.js';
import { charts } from './chart-registry.js';

function getThemeColors() {
  const isDarkThemeActive = document.documentElement.getAttribute('data-theme') === 'dark';
  return {
    gridColor: isDarkThemeActive ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.04)',
    labelColor: isDarkThemeActive ? '#8b949e' : '#9aa3b5',
  };
}

export function createDrawdownChart() {
  const ctxDrawdown = document.getElementById('drawdownChart').getContext('2d');
  const { gridColor, labelColor } = getThemeColors();

  charts.drawdownChart = new Chart(ctxDrawdown, {
    type: 'line',
    data: {
      labels: [],
      datasets: [
        {
          label: 'Total Portfolio',
          data: [],
          borderColor: '#10b981',
          backgroundColor: 'rgba(16, 185, 129, 0.04)',
          borderWidth: 2,
          pointRadius: 0,
          pointHoverRadius: 5,
          fill: true,
          tension: 0.15,
        },
        {
          label: 'Pre-Tax (Traditional)',
          data: [],
          borderColor: '#3b82f6',
          backgroundColor: 'transparent',
          borderWidth: 1.5,
          borderDash: [4, 3],
          pointRadius: 0,
          pointHoverRadius: 4,
          fill: false,
          tension: 0.15,
        },
        {
          label: 'Post-Tax (Roth)',
          data: [],
          borderColor: '#a855f7',
          backgroundColor: 'transparent',
          borderWidth: 1.5,
          borderDash: [4, 3],
          pointRadius: 0,
          pointHoverRadius: 4,
          fill: false,
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
          labels: { color: labelColor, font: { family: 'DM Sans', size: 10 }, boxWidth: 12 },
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

export function updateDrawdownChart(drawdownTimelineData) {
  if (!charts.drawdownChart || !drawdownTimelineData?.length) return;

  const labels = drawdownTimelineData.map(d => 'Age ' + d.age);
  const totalData = drawdownTimelineData.map(d => d.totalWealth);
  const preTaxData = drawdownTimelineData.map(d => d.preTax);
  const postTaxData = drawdownTimelineData.map(d => d.postTax);

  charts.drawdownChart.data.labels = labels;
  charts.drawdownChart.data.datasets[0].data = totalData;
  charts.drawdownChart.data.datasets[1].data = preTaxData;
  charts.drawdownChart.data.datasets[2].data = postTaxData;
  charts.drawdownChart.update();
}
