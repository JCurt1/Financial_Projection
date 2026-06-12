import { getState, subscribe } from './state/store.js';

import { computeAll } from './calculations/index.js';

import { initTheme } from './ui/theme.js';

import { initHeader } from './ui/header.js';

import { initBalanceSheet } from './ui/balance-sheet.js';

import { initIncomePanel } from './ui/income-panel.js';

import { initDebtDiagnostics } from './ui/debt-diagnostics.js';

import { initHealthMetrics } from './ui/health-metrics.js';

import { initProjector } from './ui/projector.js';

import { renderDashboard } from './ui/render-dashboard.js';

import { createGrowthChart } from './ui/charts/growth-chart.js';

import { createDrawdownChart } from './ui/charts/drawdown-chart.js';

import { createAssetDonut } from './ui/charts/asset-donut.js';



// Seed DOM inputs from persisted state so UI reflects what was saved
function seedDOMFromState(s) {
  const setRaw = (id, val) => { const el = document.getElementById(id); if (el) el.value = val; };
  const setFmt = (id, val) => { const el = document.getElementById(id); if (el) el.value = Number(val).toLocaleString('en-US'); };

  // Balance sheet cards
  ['cash','retirement','homeValue','brokerage','consumerDebt','mortgage'].forEach(key => {
    const card = document.querySelector(`[data-key="${key}"] .card-input`);
    if (card) card.value = Number(s[key]).toLocaleString('en-US');
  });

  // Income panel text inputs
  setFmt('in-gross',           s.grossIncome);
  setRaw('in-salary-growth',   s.annualSalaryGrowth);
  setRaw('in-401k-pct',        s.deferral401k);
  setRaw('in-match-rate',      s.employerMatchRate);
  setRaw('in-match-ceiling',   s.employerMatchCeiling);
  setFmt('in-health-raw',      s.healthCostMonthly);
  setRaw('in-state-tax-rate',  s.stateTaxRate);
  setRaw('in-cash-buffer-months', s.cashBufferMonths);
  setRaw('in-expense-growth',  s.annualExpenseGrowth);
  setFmt('in-spouse-income',   s.spouseIncome);

  const statusEl = document.getElementById('in-status');
  if (statusEl) {
    statusEl.value = s.filingStatus;
    const spouseWrap = document.getElementById('spouse-working-wrap');
    if (spouseWrap) spouseWrap.style.display = s.filingStatus === 'married' ? 'block' : 'none';
  }
  const spouseCheck = document.getElementById('in-spouse-working');
  if (spouseCheck) spouseCheck.checked = !!s.spouseWorking;

  const stateEl = document.getElementById('in-state-code');
  if (stateEl) stateEl.value = s.stateCode;

  // Roth/Trad sliders
  ['current','future'].forEach(prefix => {
    const tradKey = prefix === 'current' ? 'currentTradSplitPercent' : 'futureTradSplitPercent';
    const trad = s[tradKey] ?? 100;
    const slider = document.getElementById(`in-${prefix}-split-slider`);
    const tradIn = document.getElementById(`in-${prefix}-trad-split`);
    const rothIn = document.getElementById(`in-${prefix}-roth-split`);
    if (slider) slider.value = trad;
    if (tradIn) tradIn.value = trad;
    if (rothIn) rothIn.value = 100 - trad;
  });

  // Health tier button highlight
  const healthTiers = { 150: 'single', 450: 'spouse', 650: 'family' };
  const matchedTier = healthTiers[s.healthCostMonthly];
  if (matchedTier) {
    document.querySelectorAll('.tier-btn').forEach(b => b.classList.remove('active'));
    const btn = document.getElementById(`tier-${matchedTier}`);
    if (btn) btn.classList.add('active');
  }

  // Projector / diagnostics
  setRaw('txt-age',        s.initialAge);
  setRaw('txt-target-age', s.targetHorizonAge);
  setRaw('txt-rate',       s.marketYield);
  setRaw('debt-apr-input', s.debtApr);

  // Expenses slider + text display
  const slExp  = document.getElementById('sl-expenses');
  const txtExp = document.getElementById('txt-expenses');
  if (slExp)  slExp.value  = s.monthlyExpenses;
  if (txtExp) txtExp.value = `$${Number(s.monthlyExpenses).toLocaleString('en-US')}/mo`;
}



function run() {

  const result = computeAll(getState());

  renderDashboard(result);

}



window.addEventListener('DOMContentLoaded', () => {

  initHeader();

  initTheme();

  initBalanceSheet();

  initIncomePanel();

  initDebtDiagnostics();

  initHealthMetrics();

  initProjector();



  createGrowthChart();

  createDrawdownChart();

  createAssetDonut(getState());

  // Seed DOM from persisted state (runs after all inits so elements exist)
  seedDOMFromState(getState());

  subscribe(run);

  run();

});
