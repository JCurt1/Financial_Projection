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
        // --- Monte Carlo range band (drawn first = behind everything else) ---
        // Pulled from the same Monte Carlo engine used elsewhere in this app, over the
        // same age range. This chart's single "Total Portfolio" line assumes a flat 5%
        // return and flat 3% inflation every year, forever — real markets don't behave
        // that way. This band shows the actual range of simulated outcomes (10th-90th
        // percentile) behind it, so the flat line reads as "one scenario," not a forecast.
        {
          label: '90th Percentile (Monte Carlo)',
          data: [],
          borderColor: 'transparent',
          backgroundColor: 'rgba(16, 185, 129, 0.08)',
          borderWidth: 0,
          pointRadius: 0,
          fill: '+1',
          tension: 0.15,
        },
        {
          label: '10th Percentile (Monte Carlo)',
          data: [],
          borderColor: 'transparent',
          backgroundColor: 'transparent',
          borderWidth: 0,
          pointRadius: 0,
          fill: false,
          tension: 0.15,
        },
        {
          label: 'Total Portfolio',
          data: [],
          borderColor: '#10b981',
          backgroundColor: 'transparent',
          borderWidth: 2,
          pointRadius: 0,
          pointHoverRadius: 5,
          fill: false,
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
          label: 'Roth',
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
        {
          label: 'Taxable Brokerage',
          data: [],
          borderColor: '#f59e0b',
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
          labels: {
            color: labelColor, font: { family: 'DM Sans', size: 10 }, boxWidth: 12,
            // Keep the two invisible band-boundary datasets out of the legend clutter
            filter: item => !item.text.includes('Monte Carlo') || item.text.startsWith('90th'),
          },
        },
        tooltip: {
          mode: 'index',
          intersect: false,
          callbacks: {
            label(context) {
              if (context.dataset.label === '10th Percentile (Monte Carlo)') return null;
              const label = context.dataset.label === '90th Percentile (Monte Carlo)'
                ? '10th–90th percentile range'
                : context.dataset.label;
              return ' ' + label + ': ' + formatCurrency(context.parsed.y);
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

export function updateDrawdownChart(drawdownTimelineData, monteCarlo) {
  if (!charts.drawdownChart || !drawdownTimelineData?.length) return;

  const labels        = drawdownTimelineData.map(d => 'Age ' + d.age);
  const totalData     = drawdownTimelineData.map(d => d.totalWealth);
  const preTaxData    = drawdownTimelineData.map(d => d.preTax);
  const rothData      = drawdownTimelineData.map(d => d.roth);
  const brokerageData = drawdownTimelineData.map(d => d.brokerage);

  charts.drawdownChart.data.labels           = labels;
  // Monte Carlo band uses the same age range/cadence (targetHorizonAge → 90) as the
  // deterministic timeline, so the arrays line up 1:1 with no re-indexing needed.
  charts.drawdownChart.data.datasets[0].data = monteCarlo?.p90Path?.slice(0, drawdownTimelineData.length) || [];
  charts.drawdownChart.data.datasets[1].data = monteCarlo?.p10Path?.slice(0, drawdownTimelineData.length) || [];
  charts.drawdownChart.data.datasets[2].data = totalData;
  charts.drawdownChart.data.datasets[3].data = preTaxData;
  charts.drawdownChart.data.datasets[4].data = rothData;
  charts.drawdownChart.data.datasets[5].data = brokerageData;
  charts.drawdownChart.update();
}
