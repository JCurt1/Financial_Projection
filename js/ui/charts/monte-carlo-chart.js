let mcChartInstance = null;

export function updateMonteCarloChart(state, mcData) {
  const ctx = document.getElementById('chart-monte-carlo');
  if (!ctx) return;

  // Safety fallback: If Chart.js hasn't fully loaded globally yet, exit quietly
  const ChartGlobal = window.Chart;
  if (!ChartGlobal) {
    console.warn("Chart.js global instance not found yet.");
    return;
  }

  const startAge = Number(state.targetHorizonAge) || 60;
  const endAge = 90;
  const totalYears = endAge - startAge;
  
  if (totalYears <= 0) return;

  // 1. Build chronological X-axis labels
  const labels = [];
  for (let age = startAge; age <= endAge; age++) {
    labels.push(`Age ${age}`);
  }

  // 2. Generate smooth statistical path distribution funnels
  const p10Path = [];
  const p50Path = [];
  const p90Path = [];

  // Safely grab starting capital baseline
  const initialCapital = Number(state.retirement) || 22000; 

  // Safely grab terminal baselines from simulation data
  const p10End = Number(mcData.p10Baseline) || 0;
  const p50End = Number(mcData.p50Baseline) || initialCapital;
  const p90End = Number(mcData.p90Baseline) || (initialCapital * 2);

  for (let t = 0; t <= totalYears; t++) {
    const factor = t / totalYears;
    p10Path.push(initialCapital + (p10End - initialCapital) * factor);
    p50Path.push(initialCapital + (p50End - initialCapital) * factor);
    p90Path.push(initialCapital + (p90End - initialCapital) * factor);
  }

  // 3. Clear existing chart instance to prevent canvas data-ghosting bugs
  if (mcChartInstance) {
    try {
      mcChartInstance.destroy();
    } catch (e) {
      console.error("Error destroying old chart instance:", e);
    }
    mcChartInstance = null;
  }

  // 4. Initialize the new visual graph line matrix cleanly using global scope reference
  try {
    mcChartInstance = new ChartGlobal(ctx, {
      type: 'line',
      data: {
        labels: labels,
        datasets: [
          {
            label: '90th Percentile (Bull)',
            data: p90Path,
            borderColor: '#00cc66',
            borderWidth: 2,
            borderDash: [4, 4],
            pointRadius: 0,
            fill: false,
            tension: 0.1
          },
          {
            label: '50th Percentile (Median)',
            data: p50Path,
            borderColor: '#3399ff',
            borderWidth: 2.5,
            pointRadius: 0,
            fill: false,
            tension: 0.1
          },
          {
            label: '10th Percentile (Bear)',
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
          legend: { display: false }
        },
        scales: {
          y: {
            grid: { color: 'rgba(255, 255, 255, 0.05)' },
            ticks: {
              color: '#8a92a6',
              font: { size: 10, family: 'monospace' },
              callback: function(value) {
                return '$' + Math.round(value).toLocaleString();
              }
            }
          },
          x: {
            grid: { display: false },
            ticks: { color: '#8a92a6', font: { size: 10 } }
          }
        }
      }
    });
  } catch (error) {
    console.error("Failed to construct Monte Carlo Chart instance:", error);
  }
}
