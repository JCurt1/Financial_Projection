import { COAST_FI_REFERENCE_AGE, DRAWDOWN_GROWTH_RATE, DRAWDOWN_INFLATION_RATE, DRAWDOWN_END_AGE } from '../config/constants.js';
import { computeFederalTax } from '../config/tax-brackets-2026.js';

export function simulateWealth(state, deps) {
  const { tax, cashflow, debt, runway, fi } = deps;
  const { fiTargetNumber, annualYield } = fi;

  const currentSimulationAge = state.initialAge;
  const targetHorizonAge = state.targetHorizonAge || 60; 
  
  const monthlyDebtApr = debt.monthlyDebtApr;
  const calculatedSavingsMargin = cashflow.savingsMargin;
  const monthsToDebtFree = debt.monthsToDebtFree;
  const debtCanBePaidOff = debt.canPayOff;
  const emergencyMonths = runway.emergencyMonths;
  const neededFor6Mo = runway.neededFor6Mo;

  const labelsCollection = [];
  const trajectoryCollection = [];

  // --- 1. INITIALIZE TAX-SEGREGATED PORTFOLIOS ---
  // Decoupled: One ratio for your history, one ratio for your future
  const currentTradRatio = (state.currentTradSplitPercent ?? 100) / 100;
  const futureTradRatio = (state.futureTradSplitPercent ?? 50) / 100;
  
  // Split starting balances accurately based on past tax layout
  let simPreTaxPool = state.retirement * currentTradRatio;
  let simPostTaxPool = state.brokerage + state.cash + (state.retirement * (1 - currentTradRatio));
  let simDebt = state.consumerDebt;
  let currentCompoundingNW = simPreTaxPool + simPostTaxPool - simDebt;

  let loopsTotal = targetHorizonAge - currentSimulationAge;
  if (loopsTotal <= 0) loopsTotal = 1;

  labelsCollection.push('Age ' + currentSimulationAge);
  trajectoryCollection.push(currentCompoundingNW);

  // --- 2. EXTRACT TRACKED INFLOWS FROM YOUR TAX ENGINE ---
  // Isolate standard employer matching percent logic
  const employerMatchPercent = Math.min(state.deferral401k, state.employerMatch || 0);
  const annualEmployerMatchDollars = state.grossIncome * (employerMatchPercent / 100);
  
  // New Pre-Tax Monthly Inflow: Traditional 401(k) + Company match dollars
  const monthlyPreTaxInflow = (tax.traditional401k + annualEmployerMatchDollars) / 12;

  // New Post-Tax Monthly Inflow: Roth 401(k) + monthly HSA contributions
  const monthlyPostTaxInflow = (tax.roth401k + tax.traditionalHsa) / 12;

  let simulationMonthsOffset = 0;
  let absoluteFiAchievedAge = null;
  let absoluteCoastAchievedAge = null;

  // --- PHASE 1: ACCUMULATION ACCUMULATOR LOOP ---
  for (let currentYearIndex = 1; currentYearIndex <= loopsTotal; currentYearIndex++) {
    const activeTimelineAge = currentSimulationAge + currentYearIndex;

    for (let monthBlock = 0; monthBlock < 12; monthBlock++) {
      simulationMonthsOffset++;

      // Compound market interest growth to both standalone asset structures
      simPreTaxPool *= (1 + annualYield / 12);
      simPostTaxPool *= (1 + annualYield / 12);

      // Inject continuous tax-advantaged pre-tax streams
      simPreTaxPool += monthlyPreTaxInflow;
      
      // Inject fixed post-tax savings accounts target allocations
      simPostTaxPool += monthlyPostTaxInflow;

      // Waterfall tracking mechanics for free household cash flow surplus
      let waterfallActivePhase = 'debt';
      if (simDebt <= 0 || (debtCanBePaidOff && simulationMonthsOffset > monthsToDebtFree)) {
        waterfallActivePhase = 'runway';
      }
      if (emergencyMonths >= 6 || (waterfallActivePhase === 'runway' &&
          (simulationMonthsOffset - monthsToDebtFree) * calculatedSavingsMargin >= neededFor6Mo)) {
        waterfallActivePhase = 'investing';
      }

      // Route leftover monthly net savings cash margin after 401k/HSA/Health adjustments
      if (simDebt > 0 && calculatedSavingsMargin > 0) {
        const debtInterest = simDebt * monthlyDebtApr;
        simDebt += debtInterest - calculatedSavingsMargin;
        if (simDebt < 0) {
          simPostTaxPool += Math.abs(simDebt);
          simDebt = 0;
        }
      } else if (simDebt <= 0 && calculatedSavingsMargin > 0) {
        simPostTaxPool += calculatedSavingsMargin; // Leftover take-home compounds in taxable/post-tax pool
      } else if (calculatedSavingsMargin < 0) {
        // Safe liquid cash cushion asset reduction sequence if running a budget deficit
        let remainingDeficit = calculatedSavingsMargin;
        simPostTaxPool += remainingDeficit;
        if (simPostTaxPool < 0) {
          remainingDeficit = simPostTaxPool;
          simPostTaxPool = 0;
        } else {
          remainingDeficit = 0;
        }
        if (remainingDeficit < 0) {
          simPreTaxPool += remainingDeficit;
          if (simPreTaxPool < 0) simPreTaxPool = 0;
        }
      }

      if (simDebt > 0 && calculatedSavingsMargin <= 0) {
        simDebt += (simDebt * monthlyDebtApr);
      }

      currentCompoundingNW = simPreTaxPool + simPostTaxPool - simDebt;

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

  // --- PHASE 2: RETIREMENT DRAWDOWN CHRONOLOGY ENGINE ---
  let drawdownAge = targetHorizonAge;
  let drawdownPreTaxBucket = simPreTaxPool;
  let drawdownPostTaxBucket = simPostTaxPool;
  
  // Set starting annual expense target based on real-world consumption needs
  let indexedAnnualSpendingRequirement = state.monthlyExpenses * 12;
  const drawdownTimelineData = [];

  while (drawdownAge <= DRAWDOWN_END_AGE) {
    const combinedRetirementAssets = drawdownPreTaxBucket + drawdownPostTaxBucket;

    if (combinedRetirementAssets <= 0) {
      drawdownTimelineData.push({ age: drawdownAge, totalWealth: 0, preTax: 0, postTax: 0 });
      drawdownAge++;
      continue;
    }

    // Pro-rata drawdown allocation strategy based on current portfolio composition matrix
    const preTaxRatio = drawdownPreTaxBucket / combinedRetirementAssets;
    let baselinePreTaxPull = indexedAnnualSpendingRequirement * preTaxRatio;
    let baselinePostTaxPull = indexedAnnualSpendingRequirement * (1 - preTaxRatio);

    // DYNAMIC TAX ASSESSMENT ON PRE-TAX WITHDRAWALS
    const taxHitOnPreTaxWithdrawal = computeFederalTax(baselinePreTaxPull, state.filingStatus);
    
    let netPreTaxDeduction = baselinePreTaxPull + taxHitOnPreTaxWithdrawal;
    let netPostTaxDeduction = baselinePostTaxPull;

    // Safety fallback bounds overrides if a specific bucket runs out of money early
    if (drawdownPreTaxBucket < netPreTaxDeduction) {
      const remainderDeficit = netPreTaxDeduction - drawdownPreTaxBucket;
      netPreTaxDeduction = drawdownPreTaxBucket;
      netPostTaxDeduction += remainderDeficit; // Tax-free bucket shoulders the rest
    } else if (drawdownPostTaxBucket < netPostTaxDeduction) {
      const remainderDeficit = netPostTaxDeduction - drawdownPostTaxBucket;
      netPostTaxDeduction = drawdownPostTaxBucket;
      netPreTaxDeduction += remainderDeficit;
    }

    // Subtract distributions
    drawdownPreTaxBucket = Math.max(0, drawdownPreTaxBucket - netPreTaxDeduction);
    drawdownPostTaxBucket = Math.max(0, drawdownPostTaxBucket - netPostTaxDeduction);

    drawdownTimelineData.push({
      age: drawdownAge,
      totalWealth: drawdownPreTaxBucket + drawdownPostTaxBucket,
      preTax: drawdownPreTaxBucket,
      postTax: drawdownPostTaxBucket
    });

    // Compound remaining assets at fixed retirement-phase yields and index living expenses for inflation
    drawdownPreTaxBucket *= (1 + DRAWDOWN_GROWTH_RATE);
    drawdownPostTaxBucket *= (1 + DRAWDOWN_GROWTH_RATE);
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
    
    // EXPORT RETIREMENT TIMELINE METRICS FOR CHARTING
    drawdownTimelineData, 
  };
}

// --- BOX-MULLER GAUSSIAN RANDOMIZER ---
// Transforms uniform random variables into a normal distribution bell curve
function generateGaussianRandom(mean, standardDeviation) {
  let u = 0, v = 0;
  while(u === 0) u = Math.random(); // Converting [0,1) to (0,1)
  while(v === 0) v = Math.random();
  
  // Standard Box-Muller transform equation
  const standardNormal = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
  
  // Scale and shift by your asset configuration parameters
  return mean + standardNormal * standardDeviation;
}

// --- CORE MONTE CARLO STRESS TEST ENGINE ---
export function runMonteCarloSimulation(state, terminalAccumulatedNW, preTaxRatioAtRetirement = 0.5) {
  const iterations = 1000; // 1,000 runs gives excellent precision without slowing down the UI
  const currentAge = state.targetHorizonAge || 60; // Simulation begins exactly when retirement starts
  const endAge = 90; 
  const totalYears = endAge - currentAge;
  
  const expectedMeanReturn = (state.marketYield / 100); 
  const marketVolatility = 0.15; // Standard historical S&P 500 volatility baseline (15%)
  let indexedAnnualSpending = state.monthlyExpenses * 12;
  const inflationRate = 0.025; // 2.5% structural cost matching your drawdown matrix

  const terminalBalancesCollection = [];

  // Run 1,000 independent lifespans
  for (let simRun = 0; simRun < iterations; simRun++) {
    let currentRunBalance = terminalAccumulatedNW;
    let runSpendingTarget = indexedAnnualSpending;
    let isDepleted = false;

    for (let year = 0; year < totalYears; year++) {
      // 1. Generate a completely unique, randomized market return for this specific year
      const randomizedAnnualYield = generateGaussianRandom(expectedMeanReturn, marketVolatility);
      
      // Dynamic tax drag: pre-tax withdrawals taxed at ~22% effective, Roth withdrawals tax-free
      // Blended rate scales with how much of the portfolio is in traditional vs Roth
      const effectiveTaxRate = preTaxRatioAtRetirement * 0.22;
      const estimatedTaxBrake = 1 + effectiveTaxRate;
      const totalYearlyOutflow = runSpendingTarget * estimatedTaxBrake;

      // 3. Execute the cash drawdown mechanics
      currentRunBalance = currentRunBalance - totalYearlyOutflow;

      if (currentRunBalance <= 0) {
        currentRunBalance = 0;
        isDepleted = true;
        break; 
      }

      // 4. Compound the remaining nest egg by the randomized yield factor
      currentRunBalance *= (1 + randomizedAnnualYield);
      
      // 5. Adjust spending target upward for structural inflation
      runSpendingTarget *= (1 + inflationRate);
    }

    terminalBalancesCollection.push(currentRunBalance);
  }

  // --- CALCULATION OF PERCENTILE CHANNELS ---
  // Sort from absolute broke ($0) to hyper-growth millions
  terminalBalancesCollection.sort((a, b) => a - b);

  const totalSuccesses = terminalBalancesCollection.filter(balance => balance > 0).length;
  const probabilityOfSuccess = (totalSuccesses / iterations) * 100;

  // Extract critical statistical threshold markers
  const p10Index = Math.floor(iterations * 0.10);
  const p50Index = Math.floor(iterations * 0.50); // Median simulation path
  const p90Index = Math.floor(iterations * 0.90);

  return {
    probabilityOfSuccess: Math.round(probabilityOfSuccess),
    p10Baseline: terminalBalancesCollection[p10Index],
    p50Baseline: terminalBalancesCollection[p50Index],
    p90Baseline: terminalBalancesCollection[p90Index]
  };
}
