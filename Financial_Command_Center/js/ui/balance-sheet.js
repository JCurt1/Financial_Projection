import { parseInputVal } from '../utils/currency.js';
import { setState } from '../state/store.js';

export function initBalanceSheet() {
  document.querySelectorAll('#cards .asset-card').forEach((card) => {
    const key = card.getAttribute('data-key');
    const input = card.querySelector('.card-input');

    input.addEventListener('blur', () => {
      const numericVal = parseInputVal(input.value);
      setState({ [key]: numericVal });
      input.value = numericVal.toLocaleString('en-US');
    });

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') input.blur();
    });
  });
}
