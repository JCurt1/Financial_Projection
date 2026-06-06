import { formatCurrency } from '../utils/currency.js';

export function renderCashflowSummary({ tax, cashflow }) {
  document.getElementById('cf-tax-withheld').textContent = formatCurrency(tax.monthlyTax) + '/mo';
  document.getElementById('cf-takehome').textContent = formatCurrency(tax.baseTakehome) + '/mo';

  const maxoutBox = document.getElementById('maxout-alert-box');
  if (tax.maxedOut401k) {
    document.getElementById('cf-maxout-status').textContent = 'Maxed Out';
    maxoutBox.style.borderLeftColor = 'var(--green)';
  } else {
    document.getElementById('cf-maxout-status').textContent = 'Partial';
    maxoutBox.style.borderLeftColor = 'var(--amber)';
  }

  const surplusEl = document.getElementById('cf-surplus');
  const surplusBox = document.getElementById('cf-surplus-box');
  const margin = cashflow.savingsMargin;

  surplusEl.textContent =
    (margin < 0 ? '-' : '') + formatCurrency(Math.abs(margin)) + '/mo';
  surplusEl.style.color = margin >= 0 ? 'var(--green)' : 'var(--red)';
  surplusBox.style.borderLeftColor = margin >= 0 ? 'var(--green)' : 'var(--red)';
}
