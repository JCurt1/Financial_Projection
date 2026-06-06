import { formatCurrency } from '../utils/currency.js';

export function renderFIDiagnostics({ fi, simulation }) {
  document.getElementById('fi-number-target').textContent = formatCurrency(fi.fiTargetNumber);
  document.getElementById('fi-progress-pct').textContent = fi.progressPct.toFixed(1) + '%';

  const freedomDateEl = document.getElementById('fi-freedom-date');
  if (fi.liquidPortfolioPool >= fi.fiTargetNumber) {
    freedomDateEl.textContent = 'Immediate';
  } else if (simulation.absoluteFiAchievedAge) {
    freedomDateEl.textContent = 'Age ' + simulation.absoluteFiAchievedAge;
  } else {
    freedomDateEl.textContent = 'Out of Bounds';
  }
}
