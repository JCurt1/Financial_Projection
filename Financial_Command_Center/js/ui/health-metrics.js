import { formatCurrency, parseInputVal } from '../utils/currency.js';
import { setState } from '../state/store.js';
import { MAX_MONTHLY_EXPENSES } from '../config/constants.js';

export function initHealthMetrics() {
  const sliderExpenses = document.getElementById('sl-expenses');
  const textExpenses = document.getElementById('txt-expenses');

  sliderExpenses.addEventListener('input', (e) => {
    const val = parseInt(e.target.value);
    setState({ monthlyExpenses: val });
    textExpenses.value = formatCurrency(val) + '/mo';
  });

  textExpenses.addEventListener('blur', () => {
    let rawNumericValue = parseInputVal(textExpenses.value);
    if (rawNumericValue > MAX_MONTHLY_EXPENSES) rawNumericValue = MAX_MONTHLY_EXPENSES;
    setState({ monthlyExpenses: rawNumericValue });
    sliderExpenses.value = rawNumericValue;
    textExpenses.value = formatCurrency(rawNumericValue) + '/mo';
  });
  textExpenses.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') textExpenses.blur();
  });
}

export function renderHealthMetrics({ runway, metrics }) {
  document.getElementById('metric-emergency-runway').textContent =
    runway.emergencyMonths.toFixed(1) + ' mo';
  document.getElementById('metric-replenish-time').textContent = runway.replenishMonthsLabel;
  document.getElementById('metric-home-equity').textContent = formatCurrency(metrics.homeEquity);

  const ratioTextElem = document.getElementById('metric-debt-ratio');
  ratioTextElem.textContent = metrics.debtToAssetPct.toFixed(1) + '%';
  ratioTextElem.className = metrics.debtToAssetPct > 40
    ? 'metric-value warning'
    : 'metric-value good';
}
