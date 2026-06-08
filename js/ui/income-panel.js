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

  

  // Manual Monthly HSA Contribution

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



  // --- DUAL SLIDER SYNC CONTROLLER ENGINE ---

  // Reusable helper to lock sliders, input inputs, and states together

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



    // Handle tracking drag movements on the range slider

    slider.addEventListener('input', (e) => {

      runSyncUpdate(parseInt(e.target.value, 10));

    });



    // Handle active text adjustments in the numerical input field

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



  // Bind Control Cluster 1: Existing Nest Egg Tax Breakdown

  setupSplitController({

    sliderId: 'in-current-split-slider',

    tradInputId: 'in-current-trad-split',

    rothInputId: 'in-current-roth-split',

    stateKey: 'currentTradSplitPercent'

  });



  // Bind Control Cluster 2: Future Deferrals Tax Breakdown

  setupSplitController({

    sliderId: 'in-future-split-slider',

    tradInputId: 'in-future-trad-split',

    rothInputId: 'in-future-roth-split',

    stateKey: 'futureTradSplitPercent'

  });



  // Health tier button listeners

  document.getElementById('tier-single').addEventListener('click', () => setHealthTier('single'));

  document.getElementById('tier-spouse').addEventListener('click', () => setHealthTier('spouse'));

  document.getElementById('tier-family').addEventListener('click', () => setHealthTier('family'));

} 

