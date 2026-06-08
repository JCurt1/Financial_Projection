let mcChartInstance = null;

export function updateMonteCarloChart(state, mcData) {
  const ctx = document.getElementById('chart-monte-carlo');
  if (!ctx) return;

  const ChartGlobal = window.Chart;
  if (!ChartGlobal) {
    console.warn('Chart.js global instance not found yet.');
    return;
  }

  if (!mcData?.labels?.length) return;

  // Destroy existing chart before redrawing
  if (mcChartInstance) {
    try { mcChartInstance.destroy(); } catch (e) { /* ignore */ }
    mcChartInstance = null;
  }

  try {
    mcChartInstance = new ChartGlobal(ctx, {
      type: 'line',
      data: {
        labels: mcData.labels,
        datasets: [
          // --- Outer band: p10 to p90 (light fill) ---
          {
            label: '90th Percentile',
            data: mcData.p90Path,
            borderColor: '#00cc66',
            borderWidth: 2,
            pointRadius: 0,
            fill: '+3', // fill down to p10 dataset (index offset)
            backgroundColor: 'rgba(0, 204, 102, 0.08)',
            tension: 0.2,
          },
          // --- Inner band: p25 to p75 (stronger fill) ---
          {
            label: '75th Percentile',
            data: mcData.p75Path,
            borderColor: 'transparent',
            borderWidth: 0,
            pointRadius: 0,
            fill: '+1', // fill down to p25
            backgroundColor: 'rgba(51, 153, 255, 0.12)',
            tension: 0.2,
          },
          {
            label: '25th Percentile',
            data: mcData.p25Path,
            borderColor: 'transparent',
            borderWidth: 0,
            pointRadius: 0,
            fill: false,
            tension: 0.2,
          },
          {
            label: '10th Percentile',
            data: mcData.p10Path,
            borderColor: '#ff4d4d',
            borderWidth: 2,
            borderDash: [4, 4],
            pointRadius: 0,
            fill: false,
            tension: 0.2,
          },
          // --- Median line on top ---
          {
            label: 'Median (50th)',
            data: mcData.p50Path,
            borderColor: '#3399ff',
            borderWidth: 2.5,
            pointRadius: 0,
            fill: false,
            tension: 0.2,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: {
          mode: 'index',
          intersect: false,
        },
        plugins: {
          legend: {
            display: true,
            position: 'top',
            labels: {
              color: '#8a92a6',
              font: { size: 10, family: 'DM Sans' },
              boxWidth: 12,
              // Only show meaningful labels
              filter: item => ['90th Percentile', 'Median (50th)', '10th Percentile'].includes(item.text),
            },
          },
          tooltip: {
            callbacks: {
              label(context) {
                if (['25th Percentile', '75th Percentile'].includes(context.dataset.label)) return null;
                return ' ' + context.dataset.label + ': $' + Math.round(context.parsed.y).toLocaleString();
              },
            },
          },
        },
        scales: {
          y: {
            grid: { color: 'rgba(255,255,255,0.05)' },
            ticks: {
              color: '#8a92a6',
              font: { size: 10, family: 'monospace' },
              callback: value => '$' + Math.round(value).toLocaleString(),
            },
          },
          x: {
            grid: { display: false },
            ticks: { color: '#8a92a6', font: { size: 10 } },
          },
        },
      },
    });
  } catch (error) {
    console.error('Failed to construct Monte Carlo chart:', error);
  }
}
