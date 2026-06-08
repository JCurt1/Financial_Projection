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
  // Numeric inputs
  bindSyncInput('in-gross', 'grossIncome');
  bindSyncInput('in-401k-pct', 'deferral401k', true);
  bindSyncInput('in-match-rate', 'employerMatchRate', true);
  bindSyncInput('in-match-ceiling', 'employerMatchCeiling', true);
  bindSyncInput('in-health-raw', 'healthCostMonthly');
  bindSyncInput('in-hsa-monthly', 'hsaCostMonthly');
  bindSyncInput('in-state-tax-rate', 'stateTaxRate', true);
  bindSyncInput('in-investment-rate', 'investmentRate', true);
  bindSyncInput('in-cash-buffer-months', 'cashBufferMonths');
  bindSyncInput('in-spouse-income', 'spouseIncome');

  // Filing status
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

  // Dual slider sync controller
  function setupSplitController({ sliderId, tradInputId, rothInputId, stateKey }) {
    const slider = document.getElementById(sliderId);
    const tradInput = document.getElementById(tradInputId);
    const rothInput = document.getElementById(rothInputId);

    if (!slider) return;

    function runSyncUpdate(tradValue) {
      let cleanTrad = Math.min(100, Math.max(0, tradValue));
      if (isNaN(cleanTrad)) cleanTrad = 50;
      const cleanRoth = 100 - cleanTrad;
      slider.value = cleanTrad;
      if (tradInput && document.activeElement !== tradInput) tradInput.value = cleanTrad;
      if (rothInput) rothInput.value = cleanRoth;
      setState({ [stateKey]: cleanTrad });
    }

    slider.addEventListener('input', (e) => {
      runSyncUpdate(parseInt(e.target.value, 10));
    });

    if (tradInput) {
      tradInput.addEventListener('input', (e) => {
        const val = parseInt(e.target.value, 10);
        if (!isNaN(val)) {
          const boundedVal = Math.min(100, val);
          slider.value = boundedVal;
          if (rothInput) rothInput.value = 100 - boundedVal;
          setState({ [stateKey]: boundedVal });
        }
      });
      tradInput.addEventListener('blur', () => {
        runSyncUpdate(parseInt(tradInput.value, 10));
      });
      tradInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') tradInput.blur();
      });
    }
  }

  // Existing nest egg split
  setupSplitController({
    sliderId: 'in-current-split-slider',
    tradInputId: 'in-current-trad-split',
    rothInputId: 'in-current-roth-split',
    stateKey: 'currentTradSplitPercent',
  });

  // Future deferral split
  setupSplitController({
    sliderId: 'in-future-split-slider',
    tradInputId: 'in-future-trad-split',
    rothInputId: 'in-future-roth-split',
    stateKey: 'futureTradSplitPercent',
  });

  // Health tier buttons
  document.getElementById('tier-single').addEventListener('click', () => setHealthTier('single'));
  document.getElementById('tier-spouse').addEventListener('click', () => setHealthTier('spouse'));
  document.getElementById('tier-family').addEventListener('click', () => setHealthTier('family'));
}

const st=document.getElementById('in-state-code'); if(st){st.addEventListener('change',e=>setState({stateCode:e.target.value}));}
