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
  bindSyncInput('in-gross', 'grossIncome');
  bindSyncInput('in-401k-pct', 'deferral401k', true);
  bindSyncInput('in-match-pct', 'employerMatch', true);
  bindSyncInput('in-health-raw', 'healthCostMonthly');
  bindSyncInput('in-hsa-monthly', 'hsaCostMonthly');

  const statusSelect = document.getElementById('in-status');
  const spouseWrap = document.getElementById('spouse-working-wrap');
  const spouseCheck = document.getElementById('in-spouse-working');

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

  // --- REVERSED DUAL SLIDER SYNC ENGINE ---
  // Slider now maps to Roth (Right = Increasing Roth)
  function setupSplitController({ sliderId, tradInputId, rothInputId, stateKey }) {
    const slider = document.getElementById(sliderId);
    const tradInput = document.getElementById(tradInputId);
    const rothInput = document.getElementById(rothInputId);

    if (!slider) return;

    function runSyncUpdate(rothValue) {
      let cleanRoth = Math.min(100, Math.max(0, rothValue));
      if (isNaN(cleanRoth)) cleanRoth = 50;
      const cleanTrad = 100 - cleanRoth;

      slider.value = cleanRoth;
      
      if (rothInput && document.activeElement !== rothInput) rothInput.value = cleanRoth;
      if (tradInput) tradInput.value = cleanTrad;

      // Logic: Store the traditional percentage for calculation engine compatibility
      setState({ [stateKey]: cleanTrad });
    }

    slider.addEventListener('input', (e) => {
      runSyncUpdate(parseInt(e.target.value, 10));
    });

    if (rothInput) {
      rothInput.addEventListener('input', (e) => {
        const val = parseInt(e.target.value, 10);
        if (!isNaN(val)) {
          const boundedRoth = Math.min(100, val);
          slider.value = boundedRoth;
          if (tradInput) tradInput.value = 100 - boundedRoth;
          setState({ [stateKey]: 100 - boundedRoth });
        }
      });
    }
  }

  setupSplitController({
    sliderId: 'in-current-split-slider',
    tradInputId: 'in-current-trad-split',
    rothInputId: 'in-current-roth-split',
    stateKey: 'currentTradSplitPercent'
  });

  setupSplitController({
    sliderId: 'in-future-split-slider',
    tradInputId: 'in-future-trad-split',
    rothInputId: 'in-future-roth-split',
    stateKey: 'futureTradSplitPercent'
  });

  document.getElementById('tier-single').addEventListener('click', () => setHealthTier('single'));
  document.getElementById('tier-spouse').addEventListener('click', () => setHealthTier('spouse'));
  document.getElementById('tier-family').addEventListener('click', () => setHealthTier('family'));
}
