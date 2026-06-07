import { formatCurrency } from '../utils/currency.js';
import { setState, getState } from '../state/store.js';
import { MIN_AGE, MAX_MARKET_YIELD } from '../config/constants.js';

export function initProjector() {
  // 1. Market Yield Input Listeners
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

  // 2. Current Age Input Listeners
  const initialAgeTextInput = document.getElementById('txt-age');
  initialAgeTextInput.addEventListener('blur', () => {
    const currentState = getState();
    // Fall back to state value if target retirement age isn't set yet
    const currentTargetAge = currentState.simulation?.targetHorizonAge || 65; 

    let validatedAgeNum = parseInt(initialAgeTextInput.value);
    if (isNaN(validatedAgeNum) || validatedAgeNum < MIN_AGE) validatedAgeNum = MIN_AGE;
    
    // DYNAMIC CAP: Prevent current age from meeting or exceeding retirement age
    if (validatedAgeNum >= currentTargetAge) {
      validatedAgeNum = currentTargetAge - 1;
    }

    setState({ initialAge: validatedAgeNum });
    initialAgeTextInput.value = validatedAgeNum;
  });
  initialAgeTextInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') initialAgeTextInput.blur();
  });

  // 3. NEW: Target Retirement Age Input Listeners
  const targetAgeTextInput = document.getElementById('txt-target-age');
  targetAgeTextInput.addEventListener('blur', () => {
    const currentState = getState();
    const currentInitialAge = currentState.initialAge || 31;

    let validatedTargetNum = parseInt(targetAgeTextInput.value);
    if (isNaN(validatedTargetNum)) validatedTargetNum = 65;
    
    // DYNAMIC FLOOR: Retirement age must be at least 1 year older than current age
    if (validatedTargetNum <= currentInitialAge) {
      validatedTargetNum = currentInitialAge + 1;
    }
    
    // Optional high ceiling safety check (e.g., age 100 max)
    if (validatedTargetNum > 100) validatedTargetNum = 100;

    setState({ targetHorizonAge: validatedTargetNum });
    targetAgeTextInput.value = validatedTargetNum;
  });
  targetAgeTextInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') targetAgeTextInput.blur();
  });
}

export function renderProjector({ simulation }) {
  // Update Compounding Engine text strings dynamically
  document.getElementById('fv-target-label').textContent =
    `Projected Portfolio at Age ${simulation.targetHorizonAge}`;
  document.getElementById('fv-display').textContent = formatCurrency(simulation.terminalNW);
  document.getElementById('fv-gain').textContent =
    `+${formatCurrency(simulation.gain)} in capital generation growth`;

  // Update Drawdown Timeline block sub-header dynamically
  const drawdownTitle = document.getElementById('drawdown-title-text');
  if (drawdownTitle) {
    // Keeps the custom standard 30-year span cleanly labeled in the UI header
    const endAge = Number(simulation.targetHorizonAge) + 30; 
    drawdownTitle.textContent = 
      `Age ${simulation.targetHorizonAge}-${endAge} Retirement Drawdown Timeline (5% Growth, 4% Initial Rule + 3% Inflation)`;
  }
}
