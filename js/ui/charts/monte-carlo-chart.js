```javascript
let mcChartInstance = null;

export function updateMonteCarloChart(state, mcData) {
  const ctx = document.getElementById('chart-monte-carlo');
  if (!ctx) return;

  const startAge = state.targetHorizonAge || 60;
  const endAge = 90;
  
  // 1. Construct chronological x-axis labels (Age 60, Age 61, etc.)
  const labels = [];
  for (let age = startAge; age <= endAge; age++) {
    labels.push(`Age ${age}`);
  }

  // 2. Generate smooth statistical paths over time using our percentile anchors
  // This recreates the probability funnel mathematically for the chart path
  const totalYears = endAge - startAge;
  const p10Path = [];
  const p50Path = [];
  const p90Path = [];

  const initialCapital = mcData.initialTestingNW || state.retirement; 

  for (let t = 0; t <= totalYears; t++) {
    const factor = t / totalYears;
    // Model a standard expanding distribution funnel over the timeline
    p10Path.push(initialCapital + (mcData.p10Baseline - initialCapital) * factor);
    p50Path.push(initialCapital + (mcData.p50Baseline - initialCapital) * factor);
    p90Path.push(initialCapital + (mcData.p90Baseline - initialCapital) * factor);
  }

  // 3. Prevent canvas duplication bugs by clearing out old instances
  if (mcChartInstance) {
    mcChartInstance.destroy();
  }

  // 4. Initialize the new ChartJS visualization
  mcChartInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [
        {
          label: '90th Percentile (Bull Market)',
          data: p90Path,
          borderColor: '#00cc66',
          borderWidth: 2,
          borderDash: [4, 4],
          pointRadius: 0,
          fill: false,
          tension: 0.1
        },
        {
          label: '50th Percentile (Median Path)',
          data: p50Path,
          borderColor: '#3399ff',
          borderWidth: 2.5,
          pointRadius: 0,
          fill: false,
          tension: 0.1
        },
        {
          label: '10th Percentile (Bear Market)',
          data: p10Path,
          borderColor: '#ff4d4d',
          borderWidth: 2,
          borderDash: [4, 4],
          pointRadius: 0,
          fill: false,
          tension: 0.1
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false } // Hides clutter since our metric boxes act as labels
      },
      scales: {
        y: {
          grid: { color: 'rgba(255, 255, 255, 0.05)' },
          ticks: {
            color: '#8a92a6',
            font: { size: 10, family: 'monospace' },
            callback: (val) => '$' + Math.round(val).toLocaleString()
          }
        },
        x: {
          grid: { display: false },
          ticks: { color: '#8a92a6', font: { size: 10 } }
        }
      }
    }
  });
}
