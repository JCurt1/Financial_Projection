import { parseInputVal } from '../utils/currency.js';
import { setState } from '../state/store.js';
import { HEALTH_TIERS } from '../config/constants.js';

function bindSyncInput(elemId, stateKey, isPercent = false) {
  const element = document.getElementById(elemId);
  element.addEventListener('blur', () => {
    const cleanVal = parseInputVal(element.value);
    setState({ [stateKey]: cleanVal });
    element.value = isPercent ? cleanVal : cleanVal.toLocaleString('en-US');
  });
  element.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') element.blur();
  });
}

function setHealthTier(tier) {
  const val = HEALTH_TIERS[tier];
  document.querySelectorAll('.tier-btn').forEach((btn) => btn.classList.remove('active'));
  document.getElementById(`tier-${tier}`).classList.add('active');
  document.getElementById('in-health-raw').value = val.toLocaleString();
  setState({ healthCostMonthly: val });
}

export function initIncomePanel() {
  bindSyncInput('in-gross', 'grossIncome');
  bindSyncInput('in-401k-pct', 'deferral401k', true);
  bindSyncInput('in-match-pct', 'employerMatch', true);
  bindSyncInput('in-health-raw', 'healthCostMonthly');

  document.getElementById('in-status').addEventListener('change', (e) => {
    setState({ filingStatus: e.target.value });
  });

  document.getElementById('tier-single').addEventListener('click', () => setHealthTier('single'));
  document.getElementById('tier-spouse').addEventListener('click', () => setHealthTier('spouse'));
  document.getElementById('tier-family').addEventListener('click', () => setHealthTier('family'));
}
