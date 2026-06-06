import { formatCurrency } from '../utils/currency.js';
import { setState } from '../state/store.js';
import { MIN_AGE, MAX_MARKET_YIELD } from '../config/constants.js';

export function initProjector() {
  const yieldRateTextInput = document.getElementById('txt-rate');
  yieldRateTextInput.addEventListener('blur', () => {
    let validatedYieldNum = parseFloat(yieldRateTextInput.value);
    if (isNaN(validatedYieldNum)) validatedYieldNum = 7.0;
    if (validatedYieldNum < 0) validatedYieldNum = 0;
    if (validatedYieldNum > MAX_MARKET_YIELD) validatedYieldNum = MAX_MARKET_YIELD;
    setState({ marketYield: validatedYieldNum });
    yieldRateTextInput.value = validatedYieldNum.toFixed(1);
  });
  yieldRateTextInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') yieldRateTextInput.blur();
  });

  const initialAgeTextInput = document.getElementById('txt-age');
  initialAgeTextInput.addEventListener('blur', () => {
    let validatedAgeNum = parseInt(initialAgeTextInput.value);
    if (isNaN(validatedAgeNum) || validatedAgeNum < MIN_AGE) validatedAgeNum = MIN_AGE;
    if (validatedAgeNum >= 60) validatedAgeNum = 59;
    setState({ initialAge: validatedAgeNum });
    initialAgeTextInput.value = validatedAgeNum;
  });
  initialAgeTextInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') initialAgeTextInput.blur();
  });
}

export function renderProjector({ simulation }) {
  document.getElementById('fv-target-label').textContent =
    `Projected Portfolio at Age ${simulation.targetHorizonAge}`;
  document.getElementById('fv-display').textContent = formatCurrency(simulation.terminalNW);
  document.getElementById('fv-gain').textContent =
    `+${formatCurrency(simulation.gain)} in capital generation growth`;
}
