import { COAST_FI_REFERENCE_AGE, DRAWDOWN_GROWTH_RATE, DRAWDOWN_INFLATION_RATE, DRAWDOWN_END_AGE } from '../config/constants.js';
import { computeFederalTax } from '../config/tax-brackets-2026.js';

export function simulateWealth(state, deps) {
  const { tax, cashflow, debt, runway, fi } = deps;
  const { fiTargetNumber, annualYield } = fi;

  const currentSimulationAge = state.initialAge;
  const targetHorizonAge = state.targetHorizonAge || 65;

  const monthlyDebtApr = debt.monthlyDebtApr;
  const calculatedSavingsMargin = cashflow.savingsMargin;
  const monthsToDebtFree = debt.monthsToDebtFree;
  const debtCanBePaidOff = debt.canPayOff;
  const emergencyMonths = runway.emergencyMonths;
  const neededFor6Mo = runway.neededFor6Mo;

  const labelsCollection = [];
  const trajectoryCollection = [];

  // --- 1. INITIALIZE THREE TAX-SEGREGATED POOLS ---
  const currentTradRatio = (state.currentTradSplitPercent ?? 100) / 100;

  // Pre-Tax (Traditional 401k / IRA)
  let simPreTaxPool = state.retirement * currentTradRatio;

  // Roth (Roth 401k / Roth IRA) — Roth portion of existing retirement balance
  let simRothPool = state.retirement * (1 - currentTradRatio);

  // Taxable Brokerage — existing brokerage + cash savings
  let simBrokeragePool = state.brokerage + state.cash;

  let simDebt = state.consumerDebt;
  let currentCompoundingNW = simPreTaxPool + simRothPool + simBrokeragePool - simDebt;

  let loopsTotal = targetHorizonAge - currentSimulationAge;
  if (loopsTotal <= 0) loopsTotal = 1;

  labelsCollection.push('Age ' + currentSimulationAge);
  trajectoryCollection.push(currentCompoundingNW);

  // --- 2. MONTHLY INFLOW ROUTING ---
  const employerMatchPercent = Math.min(state.deferral401k, state.employerMatch || 0);
  const annualEmployerMatchDollars = state.grossIncome * (employerMatchPercent / 100);

  // Pre-Tax: Traditional 401(k) employee contributions + employer match
  const monthlyPreTaxInflow = (tax.traditional401k + annualEmployerMatchDollars) / 12;

  // Roth: Roth 401(k) contributions only (HSA goes to brokerage — it's triple-tax-advantaged
  // but functionally liquid, so we keep it separate from locked Roth)
  const monthlyRothInflow = tax.roth401k / 12;

  // Brokerage: HSA contributions (liquid, tax-advantaged spending account)
  const monthlyBrokerageHsaInflow = tax.traditionalHsa / 12;

  let simulationMonthsOffset = 0;
  let absoluteFiAchievedAge = null;
  let absoluteCoastAchievedAge = null;

  // --- PHASE 1: ACCUMULATION LOOP ---
  for (let currentYearIndex = 1; currentYearIndex <= loopsTotal; currentYearIndex++) {
    const activeTimelineAge = currentSimulationAge + currentYearIndex;

    for (let monthBlock = 0; monthBlock < 12; monthBlock++) {
      simulationMonthsOffset++;

      // Compound all three pools at the same market yield
      simPreTaxPool    *= (1 + annualYield / 12);
      simRothPool      *= (1 + annualYield / 12);
      simBrokeragePool *= (1 + annualYield / 12);

      // Inject dedicated monthly streams into correct buckets
      simPreTaxPool    += monthlyPreTaxInflow;
      simRothPool      += monthlyRothInflow;
      simBrokeragePool += monthlyBrokerageHsaInflow;

      // Waterfall phase tracking
      let waterfallActivePhase = 'debt';
      if (simDebt <= 0 || (debtCanBePaidOff && simulationMonthsOffset > monthsToDebtFree)) {
        waterfallActivePhase = 'runway';
      }
      if (emergencyMonths >= 6 || (waterfallActivePhase === 'runway' &&
          (simulationMonthsOffset - monthsToDebtFree) * calculatedSavingsMargin >= neededFor6Mo)) {
        waterfallActivePhase = 'investing';
      }

      // Route savings margin / deficit through waterfall
      if (simDebt > 0 && calculatedSavingsMargin > 0) {
        // Paying down debt — overflow goes to brokerage
        const debtInterest = simDebt * monthlyDebtApr;
        simDebt += debtInterest - calculatedSavingsMargin;
        if (simDebt < 0) {
          simBrokeragePool += Math.abs(simDebt);
          simDebt = 0;
        }
      } else if (simDebt <= 0 && calculatedSavingsMargin > 0) {
        // Debt-free — take-home surplus goes to taxable brokerage
        simBrokeragePool += calculatedSavingsMargin;
      } else if (calculatedSavingsMargin < 0) {
        // Budget deficit — draw from brokerage first, then Roth, then pre-tax (last resort)
        let remainingDeficit = calculatedSavingsMargin;

        simBrokeragePool += remainingDeficit;
        if (simBrokeragePool < 0) {
          remainingDeficit = simBrokeragePool;
          simBrokeragePool = 0;
        } else {
          remainingDeficit = 0;
        }

        if (remainingDeficit < 0) {
          simRothPool += remainingDeficit;
          if (simRothPool < 0) {
            remainingDeficit = simRothPool;
            simRothPool = 0;
          } else {
            remainingDeficit = 0;
          }
        }

        if (remainingDeficit < 0) {
          simPreTaxPool += remainingDeficit;
          if (simPreTaxPool < 0) simPreTaxPool = 0;
        }
      }

      if (simDebt > 0 && calculatedSavingsMargin <= 0) {
        simDebt += (simDebt * monthlyDebtApr);
      }

      currentCompoundingNW = simPreTaxPool + simRothPool + simBrokeragePool - simDebt;

      if (!absoluteFiAchievedAge && currentCompoundingNW >= fiTargetNumber) {
        absoluteFiAchievedAge = activeTimelineAge;
      }

      const yearsRemainingTo65 = Math.max(COAST_FI_REFERENCE_AGE - activeTimelineAge, 0);
      const coastFiRequiredThreshold = fiTargetNumber / Math.pow(1 + annualYield, yearsRemainingTo65);
      if (!absoluteCoastAchievedAge && currentCompoundingNW >= coastFiRequiredThreshold) {
        absoluteCoastAchievedAge = activeTimelineAge;
      }
    }

    labelsCollection.push('Age ' + activeTimelineAge);
    trajectoryCollection.push(currentCompoundingNW);
  }

  const terminalNetWorthResult = trajectoryCollection[trajectoryCollection.length - 1];
  const compoundingGrowthGain = terminalNetWorthResult - (state.retirement + state.brokerage + state.cash);

  // --- PHASE 2: RETIREMENT DRAWDOWN ---
  let drawdownAge = targetHorizonAge;
  let drawdownPreTaxBucket   = simPreTaxPool;
  let drawdownRothBucket     = simRothPool;
  let drawdownBrokerageBucket = simBrokeragePool;

  let indexedAnnualSpendingRequirement = state.monthlyExpenses * 12;
  const drawdownTimelineData = [];

  while (drawdownAge <= DRAWDOWN_END_AGE) {
    const combinedAssets = drawdownPreTaxBucket + drawdownRothBucket + drawdownBrokerageBucket;

    if (combinedAssets <= 0) {
      drawdownTimelineData.push({ age: drawdownAge, totalWealth: 0, preTax: 0, roth: 0, brokerage: 0 });
      drawdownAge++;
      continue;
    }

    // Pro-rata draw from each bucket based on its share of total portfolio
    const preTaxShare    = drawdownPreTaxBucket / combinedAssets;
    const rothShare      = drawdownRothBucket / combinedAssets;
    const brokerageShare = drawdownBrokerageBucket / combinedAssets;

    let preTaxPull    = indexedAnnualSpendingRequirement * preTaxShare;
    let rothPull      = indexedAnnualSpendingRequirement * rothShare;
    let brokeragePull = indexedAnnualSpendingRequirement * brokerageShare;

    // Tax gross-up on pre-tax withdrawals only — Roth and brokerage are tax-free at withdrawal
    const taxOnPreTax = computeFederalTax(preTaxPull, state.filingStatus);
    let netPreTaxDeduction    = preTaxPull + taxOnPreTax;
    let netRothDeduction      = rothPull;
    let netBrokerageDeduction = brokeragePull;

    // Safety fallbacks if any bucket runs dry
    if (drawdownPreTaxBucket < netPreTaxDeduction) {
      const overflow = netPreTaxDeduction - drawdownPreTaxBucket;
      netPreTaxDeduction = drawdownPreTaxBucket;
      // Overflow splits pro-rata between Roth and brokerage
      const rothOverflow = overflow * (drawdownRothBucket / (drawdownRothBucket + drawdownBrokerageBucket + 0.01));
      netRothDeduction      += rothOverflow;
      netBrokerageDeduction += overflow - rothOverflow;
    }
    if (drawdownRothBucket < netRothDeduction) {
      const overflow = netRothDeduction - drawdownRothBucket;
      netRothDeduction = drawdownRothBucket;
      netBrokerageDeduction += overflow;
    }
    if (drawdownBrokerageBucket < netBrokerageDeduction) {
      const overflow = netBrokerageDeduction - drawdownBrokerageBucket;
      netBrokerageDeduction = drawdownBrokerageBucket;
      netPreTaxDeduction += overflow;
    }

    drawdownPreTaxBucket    = Math.max(0, drawdownPreTaxBucket    - netPreTaxDeduction);
    drawdownRothBucket      = Math.max(0, drawdownRothBucket      - netRothDeduction);
    drawdownBrokerageBucket = Math.max(0, drawdownBrokerageBucket - netBrokerageDeduction);

    drawdownTimelineData.push({
      age:        drawdownAge,
      totalWealth: drawdownPreTaxBucket + drawdownRothBucket + drawdownBrokerageBucket,
      preTax:     drawdownPreTaxBucket,
      roth:       drawdownRothBucket,
      brokerage:  drawdownBrokerageBucket,
    });

    drawdownPreTaxBucket    *= (1 + DRAWDOWN_GROWTH_RATE);
    drawdownRothBucket      *= (1 + DRAWDOWN_GROWTH_RATE);
    drawdownBrokerageBucket *= (1 + DRAWDOWN_GROWTH_RATE);
    indexedAnnualSpendingRequirement *= (1 + DRAWDOWN_INFLATION_RATE);

    drawdownAge++;
  }

  return {
    growthLabels: labelsCollection,
    growthData: trajectoryCollection,
    terminalNW: terminalNetWorthResult,
    gain: compoundingGrowthGain,
    absoluteFiAchievedAge,
    absoluteCoastAchievedAge,
    targetHorizonAge,
    drawdownTimelineData,
  };
}

// --- BOX-MULLER GAUSSIAN RANDOMIZER ---
function generateGaussianRandom(mean, standardDeviation) {
  let u = 0, v = 0;
  while(u === 0) u = Math.random();
  while(v === 0) v = Math.random();
  const standardNormal = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
  return mean + standardNormal * standardDeviation;
}

// --- CORE MONTE CARLO STRESS TEST ENGINE ---
export function runMonteCarloSimulation(state, terminalAccumulatedNW, preTaxRatioAtRetirement = 0.5) {
  const iterations = 1000;
  const currentAge = state.targetHorizonAge || 65;
  const endAge = 90;
  const totalYears = endAge - currentAge;

  const expectedMeanReturn = (state.marketYield / 100);
  const marketVolatility = 0.15;
  let indexedAnnualSpending = state.monthlyExpenses * 12;
  const inflationRate = 0.025;

  const terminalBalancesCollection = [];

  for (let simRun = 0; simRun < iterations; simRun++) {
    let currentRunBalance = terminalAccumulatedNW;
    let runSpendingTarget = indexedAnnualSpending;
    let isDepleted = false;

    for (let year = 0; year < totalYears; year++) {
      const randomizedAnnualYield = generateGaussianRandom(expectedMeanReturn, marketVolatility);

      // Blended tax drag: only pre-tax portion incurs withdrawal tax (~22% effective rate)
      const effectiveTaxRate = preTaxRatioAtRetirement * 0.22;
      const estimatedTaxBrake = 1 + effectiveTaxRate;
      const totalYearlyOutflow = runSpendingTarget * estimatedTaxBrake;

      currentRunBalance = currentRunBalance - totalYearlyOutflow;

      if (currentRunBalance <= 0) {
        currentRunBalance = 0;
        isDepleted = true;
        break;
      }

      currentRunBalance *= (1 + randomizedAnnualYield);
      runSpendingTarget *= (1 + inflationRate);
    }

    terminalBalancesCollection.push(currentRunBalance);
  }

  terminalBalancesCollection.sort((a, b) => a - b);

  const totalSuccesses = terminalBalancesCollection.filter(balance => balance > 0).length;
  const probabilityOfSuccess = (totalSuccesses / iterations) * 100;

  const p10Index = Math.floor(iterations * 0.10);
  const p50Index = Math.floor(iterations * 0.50);
  const p90Index = Math.floor(iterations * 0.90);

  return {
    probabilityOfSuccess: Math.round(probabilityOfSuccess),
    p10Baseline: terminalBalancesCollection[p10Index],
    p50Baseline: terminalBalancesCollection[p50Index],
    p90Baseline: terminalBalancesCollection[p90Index],
  };
}
