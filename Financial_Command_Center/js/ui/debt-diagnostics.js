import { formatCurrency, parseInputVal } from '../utils/currency.js';
import { setState } from '../state/store.js';

export function initDebtDiagnostics() {
  const element = document.getElementById('debt-apr-input');
  element.addEventListener('blur', () => {
    const cleanVal = parseInputVal(element.value);
    setState({ debtApr: cleanVal });
    element.value = cleanVal;
  });
  element.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') element.blur();
  });
}

export function renderDebtDiagnostics({ debt }) {
  document.getElementById('debt-free-date').textContent = debt.freeDateLabel;
  document.getElementById('debt-free-months').textContent = debt.monthsLabel;

  const interestEl = document.getElementById('debt-total-interest');
  if (debt.interestLabel === null) {
    interestEl.textContent = formatCurrency(debt.totalDebtInterestFriction);
  } else {
    interestEl.textContent = debt.interestLabel;
  }
}
