import { COAST_FI_REFERENCE_AGE, DRAWDOWN_GROWTH_RATE, DRAWDOWN_INFLATION_RATE, DRAWDOWN_END_AGE, CASH_BUFFER_YIELD, estimateSsAnnualBenefit, SS_FULL_RETIREMENT_AGE, STANDARD_DEDUCTION } from '../config/constants.js';
import { computeFederalTax } from '../config/tax-brackets-2026.js';

export function simulateWealth(state, deps) {
  const { tax, cashflow, debt, runway, fi } = deps;
  const { fiTargetNumber, annualYield } = fi;
  const capitalGainsDrag =
  (state.capitalGainsDrag ?? 10) / 100;

  // During accumulation, brokerage compounds at the full market yield.
  // Capital gains tax is only owed on realized gains (i.e. when you sell),
  // not annually. A buy-and-hold index investor defers tax until withdrawal.
  // Cap gains drag is applied during the drawdown phase only (see below).
  const drawdownBrokerageYield = DRAWDOWN_GROWTH_RATE * (1 - capitalGainsDrag);

  const currentSimulationAge = state.initialAge;
  const targetHorizonAge = state.targetHorizonAge || 65;

  const monthlyDebtApr = debt.monthlyDebtApr;
  const monthsToDebtFree = debt.monthsToDebtFree;
  const debtCanBePaidOff = debt.canPayOff;
  const emergencyMonths = runway.emergencyMonths;
  const neededFor6Mo = runway.neededFor6Mo;

  const labelsCollection = [];
  const trajectoryCollection = [];

  // --- 1. INITIALIZE THREE TAX-SEGREGATED POOLS + CASH BUFFER ---
  const currentTradRatio = (state.currentTradSplitPercent ?? 100) / 100;

  // Pre-Tax (Traditional 401k / IRA)
  let simPreTaxPool = state.retirement * currentTradRatio;

  // Roth (Roth 401k / Roth IRA) — Roth portion of existing retirement balance
  let simRothPool = state.retirement * (1 - currentTradRatio);

  // Taxable Brokerage — existing brokerage balance (market yield)
  let simBrokeragePool = state.brokerage;
  let simHsaPool = state.hsaBalance || 0;
  // Cash Buffer — liquid savings/HYSA (low yield, capped target)
  // Seed with existing cash balance; target cap = cashBufferMonths x monthly expenses
  const cashBufferTarget = (state.cashBufferMonths ?? 3) * (state.monthlyExpenses || 0);
  let simCashBuffer = Math.min(state.cash, cashBufferTarget);
  // Any cash above the buffer target starts in brokerage
  simBrokeragePool += Math.max(0, state.cash - cashBufferTarget);

  // Investment rate: fraction of surplus actually deployed to market (vs lost to lifestyle/irregular spend)
  const investmentRate = Math.min(1, Math.max(0, (state.investmentRate ?? 80) / 100));

  let simDebt = state.consumerDebt;
  let currentCompoundingNW =
  simPreTaxPool +
  simRothPool +
  simBrokeragePool +
  simHsaPool +
  simCashBuffer -
  simDebt;
  
  const retirementTaxFactor =
  1 - ((state.retirementTaxRate ?? 15) / 100);

  const spendableNetWorth =
  (simPreTaxPool * retirementTaxFactor) +
  simRothPool +
  simBrokeragePool +
  simHsaPool +
  simCashBuffer -
  simDebt;
  
  let loopsTotal = targetHorizonAge - currentSimulationAge;
  if (loopsTotal <= 0) loopsTotal = 1;

  labelsCollection.push('Age ' + currentSimulationAge);
  trajectoryCollection.push(currentCompoundingNW);

  // --- 2. INFLOW ROUTING CONSTANTS (salary-growth-independent portions) ---
  const matchRate        = (state.employerMatchRate    ?? 100) / 100;
  const matchCeiling     = (state.employerMatchCeiling ?? 4)   / 100;
  const deferralRate     = state.deferral401k / 100;
  const tradRatio        = (state.futureTradSplitPercent ?? 50) / 100;
  const salaryGrowthRate  = (state.annualSalaryGrowth  ?? 0) / 100;
  const expenseGrowthRate = (state.annualExpenseGrowth ?? 0) / 100;

  let simulationMonthsOffset = 0;
  let absoluteFiAchievedAge = null;
  let absoluteCoastAchievedAge = null;

  // --- PHASE 1: ACCUMULATION LOOP ---
  for (let currentYearIndex = 1; currentYearIndex <= loopsTotal; currentYearIndex++) {
    const activeTimelineAge = currentSimulationAge + currentYearIndex;

    // Re-derive salary-dependent inflows for this year
    const yearsGrown   = currentYearIndex - 1;
    const grownGross   = state.grossIncome * Math.pow(1 + salaryGrowthRate, yearsGrown);

    // 401(k) contributions — capped at IRS limit
    const annual401k       = Math.min(grownGross * deferralRate, 23500);
    const annualTrad401k   = annual401k * tradRatio;
    const annualRoth401k   = annual401k - annualTrad401k;

    // Employer match on grown salary
    const effectiveDeferralForMatch = Math.min(deferralRate, matchCeiling);
    const annualEmployerMatch       = grownGross * effectiveDeferralForMatch * matchRate;

    // Take-home on grown salary:
    // Federal uses real bracket calc each year; FICA and state are linear so proportional scaling is exact.
    const filingStatus       = state.filingStatus === 'married' ? 'married' : 'single';
    const grownTaxableIncome = Math.max(0,
      grownGross - annual401k - tax.traditionalHsa
      - (state.healthCostMonthly * 12) - STANDARD_DEDUCTION[filingStatus]
    );
    const grownFederal = computeFederalTax(grownTaxableIncome, filingStatus);
    // FICA and state tax are linear — proportional scaling is exact
    const grossGrowthFactor  = grownGross / (state.grossIncome || 1);
    const grownFica          = (tax.monthlyFica     * 12) * grossGrowthFactor;
    const grownState         = (tax.monthlyStateTax * 12) * grossGrowthFactor;
    const grownTakehome      = grownGross - grownFederal - grownFica - grownState
                               - annual401k - tax.traditionalHsa
                               - (state.healthCostMonthly * 12);
    const grownMonthlyExpenses = state.monthlyExpenses * Math.pow(1 + expenseGrowthRate, yearsGrown);
    const grownSavingsMargin   = grownTakehome / 12 - grownMonthlyExpenses;

    const monthlyPreTaxInflow       = (annualTrad401k + annualEmployerMatch) / 12;
    const monthlyRothInflow         = annualRoth401k / 12;
    const monthlyBrokerageHsaInflow = tax.traditionalHsa / 12;

    // --- INSIDE THE MONTHLY TIMELINE LOOP ---
    for (let monthBlock = 0; monthBlock < 12; monthBlock++) {
  simulationMonthsOffset++;

  // 1. Compound ALL four investment pools + cash buffer once together
  simPreTaxPool    *= (1 + annualYield / 12);
  simRothPool      *= (1 + annualYield / 12);
  simHsaPool       *= (1 + annualYield / 12); // Moved here cleanly
  simBrokeragePool *= (1 + annualYield / 12);  // Full yield during accumulation — gains deferred until sale
  simCashBuffer    *= (1 + CASH_BUFFER_YIELD / 12); 

  // 2. Inject dedicated monthly streams into correct buckets
  simPreTaxPool += monthlyPreTaxInflow;
  simRothPool   += monthlyRothInflow;
  simHsaPool    += monthlyBrokerageHsaInflow;

      // Route savings margin / deficit through tiered waterfall
      if (simDebt > 0 && grownSavingsMargin > 0) {
        // Phase 1: Paying down debt — overflow goes to cash buffer first
        const debtInterest = simDebt * monthlyDebtApr;
        simDebt += debtInterest - grownSavingsMargin;
        if (simDebt < 0) {
          simCashBuffer += Math.abs(simDebt);
          simDebt = 0;
        }
      } else if (simDebt <= 0 && grownSavingsMargin > 0) {
        // Phase 2: Debt-free — fill cash buffer to target first, then invest remainder
        const cashBufferHeadroom = Math.max(0, cashBufferTarget - simCashBuffer);

        if (cashBufferHeadroom > 0) {
          // Still building the cash buffer — fill it up first
          const toBuffer = Math.min(grownSavingsMargin, cashBufferHeadroom);
          simCashBuffer += toBuffer;
          const remainder = grownSavingsMargin - toBuffer;
          // Any leftover after filling buffer: apply investment rate
          if (remainder > 0) {
            simBrokeragePool += remainder * investmentRate;
            // The uninvested fraction (lifestyle creep / irregular spend) is simply not added
          }
        } else {
          // Buffer is full — apply investment rate to full surplus
          simBrokeragePool += grownSavingsMargin * investmentRate;
        }
      } else if (grownSavingsMargin < 0) {
        // Budget deficit — draw from cash buffer first, then brokerage, then Roth, then pre-tax
        let remainingDeficit = grownSavingsMargin;

        simCashBuffer += remainingDeficit;
        if (simCashBuffer < 0) {
          remainingDeficit = simCashBuffer;
          simCashBuffer = 0;
        } else {
          remainingDeficit = 0;
        }

        if (remainingDeficit < 0) {
          simBrokeragePool += remainingDeficit;
          if (simBrokeragePool < 0) {
            remainingDeficit = simBrokeragePool;
            simBrokeragePool = 0;
          } else {
            remainingDeficit = 0;
          }
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

      if (simDebt > 0 && grownSavingsMargin <= 0) {
        simDebt += (simDebt * monthlyDebtApr);
      }

      currentCompoundingNW = simPreTaxPool + simRothPool + simBrokeragePool + simCashBuffer - simDebt;

      if (!absoluteFiAchievedAge && currentCompoundingNW >= fiTargetNumber) {
        absoluteFiAchievedAge = activeTimelineAge;
      }

      const yearsRemainingTo65 = Math.max(COAST_FI_REFERENCE_AGE - activeTimelineAge, 0);
      const coastFiRequiredThreshold =
  fiTargetNumber /
  Math.pow(1 + annualYield, yearsRemainingTo65);

if (!absoluteCoastAchievedAge &&
    currentCompoundingNW >= coastFiRequiredThreshold) {
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
  // At retirement, fold cash buffer into brokerage (it's all liquid non-retirement money)
  let drawdownPreTaxBucket    = simPreTaxPool;
  let drawdownRothBucket      = simRothPool;
  let drawdownBrokerageBucket = simBrokeragePool + simCashBuffer;

  // Inflate expenses forward to retirement age as starting drawdown spending baseline
  const drawdownAccumYears    = targetHorizonAge - state.initialAge;
  const expenseGrowthRateD    = (state.annualExpenseGrowth ?? 0) / 100;
  let indexedAnnualSpendingRequirement =
    state.monthlyExpenses * Math.pow(1 + expenseGrowthRateD, Math.max(0, drawdownAccumYears)) * 12;

  // Social Security: 35% wage replacement starting at full retirement age (67).
  // Applied as an annual income offset against portfolio withdrawals.
  // SS benefit uses tiered replacement rates by income level (SSA bend-point approximation)
  const ssAnnualBenefit = estimateSsAnnualBenefit(state.grossIncome);
  const ssStartAge      = Math.max(targetHorizonAge, SS_FULL_RETIREMENT_AGE);

  const drawdownTimelineData = [];

  while (drawdownAge <= DRAWDOWN_END_AGE) {
    const combinedAssets = drawdownPreTaxBucket + drawdownRothBucket + drawdownBrokerageBucket;

    if (combinedAssets <= 0) {
      drawdownTimelineData.push({ age: drawdownAge, totalWealth: 0, preTax: 0, roth: 0, brokerage: 0 });
      drawdownAge++;
      continue;
    }

    // Net spending from portfolio = expenses minus any Social Security income
    const ssOffset = drawdownAge >= ssStartAge ? ssAnnualBenefit : 0;
    const netAnnualWithdrawal = Math.max(0, indexedAnnualSpendingRequirement - ssOffset);

    // Pro-rata draw from each bucket based on its share of total portfolio
    const preTaxShare    = drawdownPreTaxBucket / combinedAssets;
    const rothShare      = drawdownRothBucket / combinedAssets;
    const brokerageShare = drawdownBrokerageBucket / combinedAssets;

    let preTaxPull    = netAnnualWithdrawal * preTaxShare;
    let rothPull      = netAnnualWithdrawal * rothShare;
    let brokeragePull = netAnnualWithdrawal * brokerageShare;

    // Tax gross-up on pre-tax withdrawals only — Roth and brokerage are tax-free at withdrawal
    // Subtract standard deduction first: first $16,100 (single) / $32,200 (married) is tax-free
    const retirementStatus = state.filingStatus === 'married' ? 'married' : 'single';
    const standardDed = retirementStatus === 'married' ? 32200 : 16100;
    const taxablePreTaxPull = Math.max(0, preTaxPull - standardDed);
    const taxOnPreTax = computeFederalTax(taxablePreTaxPull, retirementStatus);
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
    drawdownBrokerageBucket *= (1 + drawdownBrokerageYield);  // Cap gains drag applied here at realization
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
  const startAge = state.targetHorizonAge || 65;
  const endAge = 90;
  const totalYears = endAge - startAge;

  const expectedMeanReturn = (state.marketYield / 100);
  const marketVolatility = 0.15;
  const initialAnnualSpending = state.monthlyExpenses * 12;
  const inflationRate = 0.03; // 3% — matches deterministic drawdown chart assumption
  const effectiveTaxRate =
  preTaxRatioAtRetirement *
  ((state.retirementTaxRate ?? 15) / 100);
  // Tax gross-up applies only to the pre-tax portion of withdrawals.
  // Roth and brokerage withdrawals are tax-free; only traditional 401k/IRA draws are taxable.

  // Store full year-by-year paths for all runs: allPaths[year][run]
  const allPaths = Array.from({ length: totalYears + 1 }, () => []);

  for (let simRun = 0; simRun < iterations; simRun++) {
    let balance = terminalAccumulatedNW;
    let spending = initialAnnualSpending;

    allPaths[0].push(balance);

    for (let year = 0; year < totalYears; year++) {
      const randomYield = generateGaussianRandom(expectedMeanReturn, marketVolatility);

      // Only the pre-tax share of withdrawals needs to be grossed up for taxes.
      // Roth + brokerage portions are tax-free at withdrawal.
      // Use progressive marginal brackets + standard deduction — same logic as the
      // deterministic drawdown in simulateWealth() — so MC success rates are consistent.
      const retirementFilingStatus = state.filingStatus === 'married' ? 'married' : 'single';
      const mcStandardDed = retirementFilingStatus === 'married' ? 32200 : 16100;
      const preTaxPortion  = spending * preTaxRatioAtRetirement;
      const taxFreePortion = spending * (1 - preTaxRatioAtRetirement);
      const taxablePreTax  = Math.max(0, preTaxPortion - mcStandardDed);
      const taxOnPreTax    = computeFederalTax(taxablePreTax, retirementFilingStatus);
      const outflow        = preTaxPortion + taxOnPreTax + taxFreePortion;

      balance = balance - outflow;
      if (balance <= 0) {
        balance = 0;
      } else {
        balance *= (1 + randomYield);
      }
      spending *= (1 + inflationRate);

      allPaths[year + 1].push(balance);
    }
  }

  // Sort each year's cross-section to extract percentile bands
  allPaths.forEach(yearSlice => yearSlice.sort((a, b) => a - b));

  function getPercentile(yearSlice, pct) {
    return yearSlice[Math.floor(yearSlice.length * pct)] ?? 0;
  }

  const p10Path = allPaths.map(s => getPercentile(s, 0.10));
  const p25Path = allPaths.map(s => getPercentile(s, 0.25));
  const p50Path = allPaths.map(s => getPercentile(s, 0.50));
  const p75Path = allPaths.map(s => getPercentile(s, 0.75));
  const p90Path = allPaths.map(s => getPercentile(s, 0.90));

  // Labels: Age startAge through endAge
  const labels = [];
  for (let age = startAge; age <= endAge; age++) labels.push('Age ' + age);

  // Terminal success rate based on final year balances
  const terminalBalances = allPaths[allPaths.length - 1];
  const totalSuccesses = terminalBalances.filter(b => b > 0).length;
  const probabilityOfSuccess = (totalSuccesses / iterations) * 100;

  return {
    probabilityOfSuccess: Math.round(probabilityOfSuccess),
    p10Baseline: p10Path[p10Path.length - 1],
    p50Baseline: p50Path[p50Path.length - 1],
    p90Baseline: p90Path[p90Path.length - 1],
    labels,
    p10Path,
    p25Path,
    p50Path,
    p75Path,
    p90Path,
  };
}
