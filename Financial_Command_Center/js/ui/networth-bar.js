import { formatCurrency } from '../utils/currency.js';

export function renderNetworthBar({ balanceSheet }) {
  const { netWorth, totalAssets, totalLiabilities } = balanceSheet;

  document.getElementById('networth-display').textContent = formatCurrency(netWorth);
  document.getElementById('assets-display').textContent = formatCurrency(totalAssets);
  document.getElementById('liabilities-display').textContent = formatCurrency(totalLiabilities);

  const nwDisp = document.getElementById('networth-display');
  nwDisp.className = netWorth >= 0 ? 'nw-value green' : 'nw-value red';
}
