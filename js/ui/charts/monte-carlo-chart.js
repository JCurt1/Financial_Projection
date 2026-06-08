let mcChartInstance = null;

export function updateMonteCarloChart(state, mcData, terminalNW) {
  const ctx = document.getElementById('chart-monte-carlo');
  if (!ctx) return;

  const ChartGlobal = window.Chart;
  if (!ChartGlobal) {
    console.warn('Chart.js global instance not found yet.');
    return;
  }

  const startAge  = Number(state.targetHorizonAge) || 65;
  const endAge    = 90;
  const totalYears = endAge - startAge;
  if (totalYears <= 0) return;

  // X-axis labels
  const labels = [];
  for (let age = startAge; age <= endAge; age++) {
    labels.push(`Age ${age}`);
  }

  // Starting point is the actual retirement balance, not state.retirement
  const initialBalance = Number(terminalNW) || 0;

  const annualSpending  = (state.monthlyExpenses || 0) * 12;
  const inflationRate   = 0.025;

  // Derive implied annual growth rates that would produce each percentile endpoint
  // by solving: balance * (1+r)^n - spending_stream = endpoint
  // We approximate by simulating a constant-return path for each percentile
  function simulatePath(endBalance) {
    if (initialBalance <= 0) return Array(totalYears + 1).fill(0);

    // Binary search for the constant annual return that produces endBalance
    let lo = -0.30, hi = 0.50;
    let impliedReturn = 0.05;

    for (let iter = 0; iter < 40; iter++) {
      impliedReturn = (lo + hi) / 2;
      let bal = initialBalance;
      let spend = annualSpending;
      for (let y = 0; y < totalYears; y++) {
        bal = bal - spend;
        if (bal <= 0) { bal = 0; break; }
        bal *= (1 + impliedReturn);
        spend *= (1 + inflationRate);
      }
      if (bal < endBalance) lo = impliedReturn;
      else hi = impliedReturn;
    }

    // Now build the year-by-year path using that implied return
    const path = [initialBalance];
    let bal   = initialBalance;
    let spend = annualSpending;
    for (let y = 0; y < totalYears; y++) {
      bal = bal - spend;
      if (bal <= 0) { path.push(0); break; }
      bal *= (1 + impliedReturn);
      spend *= (1 + inflationRate);
      path.push(Math.max(0, bal));
    }
    // Pad with zeros if depleted early
    while (path.length < totalYears + 1) path.push(0);
    return path;
  }

  const p10Path = simulatePath(Math.max(0, Number(mcData.p10Baseline) || 0));
  const p50Path = simulatePath(Math.max(0, Number(mcData.p50Baseline) || initialBalance));
  const p90Path = simulatePath(Math.max(0, Number(mcData.p90Baseline) || initialBalance * 2));

  // Destroy existing chart before redrawing
  if (mcChartInstance) {
    try { mcChartInstance.destroy(); } catch (e) { /* ignore */ }
    mcChartInstance = null;
  }

  try {
    mcChartInstance = new ChartGlobal(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: '90th Percentile (Bull)',
            data: p90Path,
            borderColor: '#00cc66',
            borderWidth: 2,
            borderDash: [4, 4],
            pointRadius: 0,
            fill: false,
            tension: 0.2,
          },
          {
            label: '50th Percentile (Median)',
            data: p50Path,
            borderColor: '#3399ff',
            borderWidth: 2.5,
            pointRadius: 0,
            fill: false,
            tension: 0.2,
          },
          {
            label: '10th Percentile (Bear)',
            data: p10Path,
            borderColor: '#ff4d4d',
            borderWidth: 2,
            borderDash: [4, 4],
            pointRadius: 0,
            fill: false,
            tension: 0.2,
          },
        ],
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
