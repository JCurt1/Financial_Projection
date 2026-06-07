import { parseInputVal } from '../utils/currency.js';
import { setState, getState } from '../state/store.js'; // Added getState to handle initial visibility syncing
import { HEALTH_TIERS } from '../config/constants.js';

function bindSyncInput(elemId, stateKey, isPercent = false) {
  const element = document.getElementById(elemId);
  if (!element) return;
  
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
  // 1. Maintain existing core numerical input bindings
  bindSyncInput('in-gross', 'grossIncome');
  bindSyncInput('in-401k-pct', 'deferral401k', true);
  bindSyncInput('in-match-pct', 'employerMatch', true);
  bindSyncInput('in-health-raw', 'healthCostMonthly');

  // DOM References for the newly injected UI structures
  const statusSelect = document.getElementById('in-status');
  const spouseWrap = document.getElementById('spouse-working-wrap');
  const spouseCheck = document.getElementById('in-spouse-working');
  const hsaCheck = document.getElementById('in-has-hsa');
  const strategySelect = document.getElementById('in-strategy');

  // 2. Filing Status Listener with dynamic Sub-Toggle visibility
  if (statusSelect) {
    statusSelect.addEventListener('change', (e) => {
      const val = e.target.value;
      const isMarried = val === 'married';
      
      if (spouseWrap) spouseWrap.style.display = isMarried ? 'block' : 'none';
      
      const updates = { filingStatus: val };
      
      // Safety clean-up: Uncheck and disable spouse working state if changing status back to Single
      if (!isMarried) {
        updates.spouseWorking = false;
        if (spouseCheck) spouseCheck.checked = false;
      }
      
      setState(updates);
    });
  }

  // 3. Checkbox Listener for Spousal 401k Contributions
  if (spouseCheck) {
    spouseCheck.addEventListener('change', (e) => {
      setState({ spouseWorking: e.target.checked });
    });
  }

  // 4. Checkbox Listener for HSA Account Eligibility
  if (hsaCheck) {
    hsaCheck.addEventListener('change', (e) => {
      setState({ hasHsa: e.target.checked });
    });
  }

  // 5. Dropdown Selection Listener for the Smart Tax Optimization Engine
  if (strategySelect) {
    strategySelect.addEventListener('change', (e) => {
      setState({ strategy401k: e.target.value });
    });
  }

  // 6. Existing health cost button listeners
  document.getElementById('tier-single').addEventListener('click', () => setHealthTier('single'));
  document.getElementById('tier-spouse').addEventListener('click', () => setHealthTier('spouse'));
  document.getElementById('tier-family').addEventListener('click', () => setHealthTier('family'));
}
