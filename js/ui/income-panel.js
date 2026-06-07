import { parseInputVal } from '../utils/currency.js';
import { setState } from '../state/store.js';
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
  // Existing numeric inputs
  bindSyncInput('in-gross', 'grossIncome');
  bindSyncInput('in-401k-pct', 'deferral401k', true);
  bindSyncInput('in-match-pct', 'employerMatch', true);
  bindSyncInput('in-health-raw', 'healthCostMonthly');
  
  // New input: Manual Monthly HSA Contribution
  bindSyncInput('in-hsa-monthly', 'hsaCostMonthly');

  const statusSelect = document.getElementById('in-status');
  const spouseWrap = document.getElementById('spouse-working-wrap');
  const spouseCheck = document.getElementById('in-spouse-working');
  
  // New elements: Slider and labels
  const splitSlider = document.getElementById('in-401k-split');
  const tradLabel = document.getElementById('trad-split-label');
  const rothLabel = document.getElementById('roth-split-label');

  if (statusSelect) {
    statusSelect.addEventListener('change', (e) => {
      const val = e.target.value;
      const isMarried = val === 'married';
      if (spouseWrap) spouseWrap.style.display = isMarried ? 'block' : 'none';
      
      const updates = { filingStatus: val };
      if (!isMarried) {
        updates.spouseWorking = false;
        if (spouseCheck) spouseCheck.checked = false;
      }
      setState(updates);
    });
  }

  if (spouseCheck) {
    spouseCheck.addEventListener('change', (e) => {
      setState({ spouseWorking: e.target.checked });
    });
  }

  // Slider change listener: updates visual labels and pushes split to state engine
  if (splitSlider) {
    splitSlider.addEventListener('input', (e) => {
      const tradVal = parseInt(e.target.value, 10);
      const rothVal = 100 - tradVal;
      
      if (tradLabel) tradLabel.textContent = tradVal;
      if (rothLabel) rothLabel.textContent = rothVal;
      
      setState({ tradSplitPercent: tradVal });
    });
  }

  document.getElementById('tier-single').addEventListener('click', () => setHealthTier('single'));
  document.getElementById('tier-spouse').addEventListener('click', () => setHealthTier('spouse'));
  document.getElementById('tier-family').addEventListener('click', () => setHealthTier('family'));
}
