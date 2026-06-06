import { formatCurrency, parseInputVal } from '../utils/currency.js';
import { setState } from '../state/store.js';

// LEAVE THIS ENTIRE FIRST SECTION ALONE
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

// THIS IS THE ONLY SECTION YOU ARE OVERWRITING/UPDATING
export function renderDebtDiagnostics({ debt }) {
  document.getElementById('debt-free-date').textContent = debt.freeDateLabel;
  document.getElementById('debt-free-months').textContent = debt.monthsLabel;

  const interestEl = document.getElementById('debt-total-interest');
  if (debt.interestLabel === null) {
    interestEl.textContent = formatCurrency(debt.totalDebtInterestFriction);
  } else {
    interestEl.textContent = debt.interestLabel;
  }

  // --- HIDE / SHOW THE DEBT BURN PANEL UI ---
  const debtBurnPanel = document.getElementById('debt-burn-panel');
  
  if (debtBurnPanel) {
    if (!debt.consumerDebt || debt.consumerDebt <= 0) {
      debtBurnPanel.style.display = 'none';
    } else {
      debtBurnPanel.style.display = 'block'; 
    }
  }
}
