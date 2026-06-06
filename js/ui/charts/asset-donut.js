import { charts } from './chart-registry.js';

export function createAssetDonut(state) {
  const ctxAllocationDonut = document.getElementById('assetDonut').getContext('2d');
  const isDarkThemeActive = document.documentElement.getAttribute('data-theme') === 'dark';

  charts.assetDonut = new Chart(ctxAllocationDonut, {
    type: 'doughnut',
    data: {
      labels: ['Cash', 'Retirement', 'Brokerage', 'Property'],
      datasets: [{
        data: [state.cash, state.retirement, state.brokerage, state.homeValue],
        backgroundColor: ['#2563eb', '#0e9f6e', '#d97706', '#7c3aed'],
        borderWidth: 0,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '75%',
      plugins: {
        legend: {
          position: 'right',
          labels: {
            color: isDarkThemeActive ? '#c9d1d9' : '#0d1117',
            font: { family: 'DM Sans', size: 11 },
            boxWidth: 12,
            padding: 10,
          },
        },
      },
    },
  });
}

export function updateAssetDonut(state) {
  if (!charts.assetDonut) return;
  charts.assetDonut.data.datasets[0].data = [
    state.cash,
    state.retirement,
    state.brokerage,
    state.homeValue,
  ];
  charts.assetDonut.update();
}
