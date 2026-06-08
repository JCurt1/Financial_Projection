import { formatCurrency } from '../utils/currency.js';

export function renderCashflowSummary({ tax, cashflow }) {
  // Combined tax display with breakdown tooltip-style sub-label
  const taxEl = document.getElementById('cf-tax-withheld');
  if (taxEl) {
    taxEl.textContent = formatCurrency(tax.monthlyTax) + '/mo';
    taxEl.title = [
      'Federal: ' + formatCurrency(tax.monthlyFederal) + '/mo',
      'FICA/SS: ' + formatCurrency(tax.monthlyFica) + '/mo',
      'State: ' + formatCurrency(tax.monthlyStateTax) + '/mo',
    ].join(' | ');
  }

  // Tax breakdown sub-label beneath the main value
  const taxSubEl = document.getElementById('cf-tax-breakdown');
  if (taxSubEl) {
    const parts = [
      'Fed ' + formatCurrency(tax.monthlyFederal),
      'FICA ' + formatCurrency(tax.monthlyFica),
    ];
    if (tax.monthlyStateTax > 0) parts.push('State ' + formatCurrency(tax.monthlyStateTax));
    taxSubEl.textContent = parts.join(' · ');
  }

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
