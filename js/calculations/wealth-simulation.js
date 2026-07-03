import { COAST_FI_REFERENCE_AGE, DRAWDOWN_GROWTH_RATE, DRAWDOWN_VOLATILITY, DRAWDOWN_INFLATION_RATE, DRAWDOWN_END_AGE, CASH_BUFFER_YIELD, estimateSsAnnualBenefit, SS_FULL_RETIREMENT_AGE, STANDARD_DEDUCTION, MAX_401K_INDIVIDUAL, MAX_401K_CATCHUP_50, MAX_401K_CATCHUP_60_63, MAX_ANNUAL_ADDITIONS, rmdStartAge, rmdDivisorForAge } from '../config/constants.js';
import { computeFederalTax } from '../config/tax-brackets-2026.js';
import { computeAnnualFica } from './tax.js';

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

  // Snapshot starting pool balances (post cash-buffer-overflow adjustment above) for the
  // Monte Carlo engine, which replays the same contribution schedule under random yields
  // instead of starting every trial from a single deterministic terminal number.
  const mcInitialPreTax    = simPreTaxPool;
  const mcInitialRoth      = simRothPool;
  const mcInitialBrokerage = simBrokeragePool;
  const mcInitialHsa       = simHsaPool;
  const mcDeltaPreTaxByMonth    = [];
  const mcDeltaRothByMonth      = [];
  const mcDeltaBrokerageByMonth = [];
  const mcDeltaHsaByMonth       = [];

  // --- Home value & mortgage amortization (tracked separately from liquid net worth) ---
  // Home equity is excluded from currentCompoundingNW/fiTargetNumber comparisons — standard
  // FIRE practice, since you can't spend down a primary residence without also housing yourself.
  // It's tracked in parallel so the net worth chart can show TRUE total net worth (matching
  // the balance sheet, which already includes home value/mortgage) instead of silently
  // dropping the house the moment the projection starts.
  let simHomeValue = state.homeValue || 0;
  let simMortgageBalance = state.mortgage || 0;
  const mortgageAnnualRate  = (state.mortgageRate ?? 6.5) / 100;
  const mortgageMonthlyRate = mortgageAnnualRate / 12;
  const mortgageTermMonths  = Math.max(1, (state.mortgageTermYears ?? 30) * 12);
  const homeAppreciationRate  = (state.homeAppreciationRate ?? 3.5) / 100;
  const homeAppreciationMonthly = Math.pow(1 + homeAppreciationRate, 1 / 12) - 1;
  // Fixed level payment on the current balance/rate/remaining term (standard amortization formula)
  const mortgageMonthlyPayment = simMortgageBalance <= 0 ? 0
    : mortgageMonthlyRate === 0
      ? simMortgageBalance / mortgageTermMonths
      : simMortgageBalance * mortgageMonthlyRate / (1 - Math.pow(1 + mortgageMonthlyRate, -mortgageTermMonths));

  
  
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
  const homeEquityCollection = [simHomeValue - simMortgageBalance];

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

    // 401(k) contributions — capped at IRS limit, with age-based catch-up
    const activeAge = currentSimulationAge + currentYearIndex;
    const annual401kCap = (activeAge >= 60 && activeAge <= 63)
      ? MAX_401K_CATCHUP_60_63
      : activeAge >= 50 ? MAX_401K_CATCHUP_50 : MAX_401K_INDIVIDUAL;
    const annual401k       = Math.min(grownGross * deferralRate, annual401kCap);
    const annualTrad401k   = annual401k * tradRatio;
    const annualRoth401k   = annual401k - annualTrad401k;

    // Employer match on grown salary, capped by the combined IRC §415(c) annual
    // additions limit (employee non-catch-up deferrals + employer contributions).
    // Catch-up dollars are exempt and stack on top of the cap.
    const effectiveDeferralForMatch = Math.min(deferralRate, matchCeiling);
    let annualEmployerMatch         = grownGross * effectiveDeferralForMatch * matchRate;
    const catchUpContribution   = Math.max(0, annual401k - MAX_401K_INDIVIDUAL);
    const nonCatchUpDeferral    = annual401k - catchUpContribution;
    const employerMatchRoom415c = Math.max(0, MAX_ANNUAL_ADDITIONS - nonCatchUpDeferral);
    annualEmployerMatch          = Math.min(annualEmployerMatch, employerMatchRoom415c);

    // Take-home on grown salary:
    // Federal uses real bracket calc each year; FICA and state are linear so proportional scaling is exact.
    const filingStatus       = state.filingStatus === 'married' ? 'married' : 'single';
    const grownTaxableIncome = Math.max(0,
      grownGross - annual401k - tax.traditionalHsa
      - (state.healthCostMonthly * 12) - STANDARD_DEDUCTION[filingStatus]
    );
    const grownFederal = computeFederalTax(grownTaxableIncome, filingStatus);
    // FICA is recomputed directly each year (not scaled proportionally) because
    // the 0.9% Additional Medicare surtax only applies above a fixed threshold —
    // salary growth can cross that line partway through the simulation, and
    // proportional scaling of a below-threshold base year would silently miss it.
    // State tax is a flat rate, so proportional scaling of it is still exact.
    const grossGrowthFactor  = grownGross / (state.grossIncome || 1);
    const grownFica          = computeAnnualFica(grownGross, filingStatus, tax.traditionalHsa + (state.healthCostMonthly * 12));
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

  // Track this month's net cash-flow contribution to each pool, separate from market
  // growth, so the Monte Carlo engine can replay the identical dollar schedule under
  // random yields instead of one shared deterministic path.
  let mcDeltaPreTax    = monthlyPreTaxInflow;
  let mcDeltaRoth      = monthlyRothInflow;
  let mcDeltaHsa       = monthlyBrokerageHsaInflow;
  let mcDeltaBrokerage = 0;

  // 1. Compound ALL four investment pools + cash buffer once together
  simPreTaxPool    *= (1 + annualYield / 12);
  simRothPool      *= (1 + annualYield / 12);
  simHsaPool       *= (1 + annualYield / 12); // Moved here cleanly
  simBrokeragePool *= (1 + annualYield / 12);  // Full yield during accumulation — gains deferred until sale
  simCashBuffer    *= (1 + CASH_BUFFER_YIELD / 12); 

  // 1b. Home value appreciates; mortgage amortizes on a fixed level payment.
  // This runs independent of the cashflow waterfall above — the mortgage payment
  // is assumed to already be covered out of monthlyExpenses, so it isn't drawn
  // from the investable pools here, just tracked for home equity purposes.
  simHomeValue *= (1 + homeAppreciationMonthly);
  if (simMortgageBalance > 0) {
    const mortgageInterest = simMortgageBalance * mortgageMonthlyRate;
    const mortgagePrincipal = Math.min(mortgageMonthlyPayment - mortgageInterest, simMortgageBalance);
    simMortgageBalance -= Math.max(0, mortgagePrincipal);
  }

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
            mcDeltaBrokerage += remainder * investmentRate;
            // The uninvested fraction (lifestyle creep / irregular spend) is simply not added
          }
        } else {
          // Buffer is full — apply investment rate to full surplus
          simBrokeragePool += grownSavingsMargin * investmentRate;
          mcDeltaBrokerage += grownSavingsMargin * investmentRate;
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
          mcDeltaBrokerage += remainingDeficit;
          if (simBrokeragePool < 0) {
            remainingDeficit = simBrokeragePool;
            simBrokeragePool = 0;
          } else {
            remainingDeficit = 0;
          }
        }

        if (remainingDeficit < 0) {
          simRothPool += remainingDeficit;
          mcDeltaRoth += remainingDeficit;
          if (simRothPool < 0) {
            remainingDeficit = simRothPool;
            simRothPool = 0;
          } else {
            remainingDeficit = 0;
          }
        }

        if (remainingDeficit < 0) {
          simPreTaxPool += remainingDeficit;
          mcDeltaPreTax += remainingDeficit;
          if (simPreTaxPool < 0) simPreTaxPool = 0;
        }
      }

      if (simDebt > 0 && grownSavingsMargin <= 0) {
        simDebt += (simDebt * monthlyDebtApr);
      }

      currentCompoundingNW = simPreTaxPool + simRothPool + simBrokeragePool + simHsaPool + simCashBuffer - simDebt;

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

  mcDeltaPreTaxByMonth.push(mcDeltaPreTax);
  mcDeltaRothByMonth.push(mcDeltaRoth);
  mcDeltaBrokerageByMonth.push(mcDeltaBrokerage);
  mcDeltaHsaByMonth.push(mcDeltaHsa);
    }

    labelsCollection.push('Age ' + activeTimelineAge);
    trajectoryCollection.push(currentCompoundingNW);
    homeEquityCollection.push(simHomeValue - simMortgageBalance);
  }

  const terminalNetWorthResult = trajectoryCollection[trajectoryCollection.length - 1];
  const compoundingGrowthGain = terminalNetWorthResult - (state.retirement + state.brokerage + state.cash);

  // --- PHASE 2: RETIREMENT DRAWDOWN ---
  // Snapshot home value/mortgage AT retirement before continuing to age them through
  // drawdown below — simHomeValue/simMortgageBalance keep mutating past this point.
  const homeValueAtRetirement = simHomeValue;
  const mortgageBalanceAtRetirement = simMortgageBalance;
  const homeEquityAtRetirement = simHomeValue - simMortgageBalance;

  let drawdownAge = targetHorizonAge;
  // At retirement, fold cash buffer AND remaining HSA balance into brokerage (all liquid,
  // non-retirement-account money). NOTE: simHsaPool was previously dropped here entirely —
  // it kept compounding through accumulation but then vanished from the retirement drawdown
  // simulation instead of being spent down. Folding it into brokerage fixes that.
  let drawdownPreTaxBucket    = simPreTaxPool;
  let drawdownRothBucket      = simRothPool;
  let drawdownBrokerageBucket = simBrokeragePool + simCashBuffer + simHsaPool;

  // Inflate expenses forward to retirement age as starting drawdown spending baseline
  const drawdownAccumYears    = targetHorizonAge - state.initialAge;
  const expenseGrowthRateD    = (state.annualExpenseGrowth ?? 0) / 100;
  let indexedAnnualSpendingRequirement =
    state.monthlyExpenses * Math.pow(1 + expenseGrowthRateD, Math.max(0, drawdownAccumYears)) * 12;

  // Social Security: 35% wage replacement starting at full retirement age (67).
  // Applied as an annual income offset against portfolio withdrawals.
  // SS benefit uses tiered replacement rates on the salary at retirement, not current salary.
  // SS is based on your highest 35 years of indexed earnings — using the grown salary at
  // retirement age is a much better proxy than today's income for someone early in their career.
  const yearsToRetirement   = Math.max(0, targetHorizonAge - state.initialAge);
  const salaryAtRetirement  = state.grossIncome * Math.pow(1 + salaryGrowthRate, yearsToRetirement);
  const ssAnnualBenefit     = estimateSsAnnualBenefit(salaryAtRetirement);
  const ssStartAge          = Math.max(targetHorizonAge, SS_FULL_RETIREMENT_AGE);

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

    // --- Required Minimum Distributions (SECURE 2.0) ---
    // The IRS forces a minimum pre-tax withdrawal starting at age 73 or 75 (birth-year
    // dependent) regardless of spending need. If the RMD exceeds what this year's spending
    // waterfall would have pulled from pre-tax anyway, the excess is still forced out —
    // taxed as ordinary income — and reinvested into the brokerage bucket since it isn't spent.
    const birthYear = new Date().getFullYear() - state.initialAge;
    const rmdAge = rmdStartAge(birthYear);
    const rmdDivisor = drawdownAge >= rmdAge ? rmdDivisorForAge(drawdownAge) : null;
    const requiredMinimumDistribution = rmdDivisor ? drawdownPreTaxBucket / rmdDivisor : 0;
    const rmdForcedExcess = Math.max(0, requiredMinimumDistribution - preTaxPull);
    const totalPreTaxGrossWithdrawal = preTaxPull + rmdForcedExcess;

    // Tax gross-up on pre-tax withdrawals only — Roth and brokerage are tax-free at withdrawal
    // Subtract standard deduction first: first $16,100 (single) / $32,200 (married) is tax-free
    const retirementStatus = state.filingStatus === 'married' ? 'married' : 'single';
    const standardDed = retirementStatus === 'married' ? 32200 : 16100;
    const taxablePreTaxPull = Math.max(0, totalPreTaxGrossWithdrawal - standardDed);
    const taxOnPreTax = computeFederalTax(taxablePreTaxPull, retirementStatus);
    // Net-of-tax proceeds from the forced RMD excess (beyond what spending needed) get
    // reinvested into the brokerage bucket rather than evaporating from net worth.
    const rmdExcessNetOfTax = Math.max(0, rmdForcedExcess - (taxOnPreTax * (rmdForcedExcess / (totalPreTaxGrossWithdrawal || 1))));
    let netPreTaxDeduction    = totalPreTaxGrossWithdrawal + taxOnPreTax;
    let netRothDeduction      = rothPull;
    let netBrokerageDeduction = brokeragePull - rmdExcessNetOfTax;

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

    // Home keeps appreciating and (if not already paid off) the mortgage keeps amortizing
    // through retirement — tracked for the home-equity figure only, not drawn on for spending.
    simHomeValue *= Math.pow(1 + homeAppreciationMonthly, 12);
    if (simMortgageBalance > 0) {
      for (let m = 0; m < 12 && simMortgageBalance > 0; m++) {
        const mortgageInterest = simMortgageBalance * mortgageMonthlyRate;
        const mortgagePrincipal = Math.min(mortgageMonthlyPayment - mortgageInterest, simMortgageBalance);
        simMortgageBalance -= Math.max(0, mortgagePrincipal);
      }
    }

    drawdownAge++;
  }

  // Package the deterministic contribution schedule + starting balances for the Monte
  // Carlo engine to replay under randomized yields (see runMonteCarloSimulation below).
  const mcAccumulationSchedule = {
    initialPreTax:    mcInitialPreTax,
    initialRoth:      mcInitialRoth,
    initialBrokerage: mcInitialBrokerage,
    initialHsa:       mcInitialHsa,
    deltaPreTaxByMonth:    mcDeltaPreTaxByMonth,
    deltaRothByMonth:      mcDeltaRothByMonth,
    deltaBrokerageByMonth: mcDeltaBrokerageByMonth,
    deltaHsaByMonth:       mcDeltaHsaByMonth,
    cashBufferAtRetirement: simCashBuffer,
    // Any consumer debt not yet paid off by retirement (rare — most plans clear it
    // well before targetHorizonAge) is deterministic, not market-exposed, so it's
    // carried as a flat subtraction rather than replayed.
    debtAtRetirement: simDebt,
  };

  return {
    growthLabels: labelsCollection,
    growthData: trajectoryCollection,
    terminalNW: terminalNetWorthResult,
    gain: compoundingGrowthGain,
    absoluteFiAchievedAge,
    absoluteCoastAchievedAge,
    targetHorizonAge,
    drawdownTimelineData,
    mcAccumulationSchedule,
    // Home equity tracked as its own parallel series (not part of terminalNW/growthData,
    // which stay liquid-investable-only since those feed the Monte Carlo starting
    // balance and the "Portfolio" figures). Add growthData[i] + homeEquityData[i] for
    // a true total-net-worth line matching the balance sheet's "True Net Worth".
    homeEquityData: homeEquityCollection,
    homeEquityAtRetirement,
    homeValueAtRetirement,
    mortgageBalanceAtRetirement,
    // These continue tracking home value/mortgage payoff all the way to DRAWDOWN_END_AGE (90)
    homeEquityAtEndOfHorizon: simHomeValue - simMortgageBalance,
    homeValueAtEndOfHorizon: simHomeValue,
    mortgageBalanceAtEndOfHorizon: simMortgageBalance,
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

// --- LOGNORMAL RETURN SAMPLER ---
// Market returns compound multiplicatively, so they're better modeled as lognormal
// than as a plain Gaussian arithmetic return. A raw Gaussian draw can (and with real
// frequency, at 15% annual vol, does) produce returns below -100%, which is impossible —
// you can't lose more than everything. Lognormal draws are bounded below at -100% and
// naturally produce the right-skewed distribution real market returns show.
//
// Calibrated so the arithmetic mean of the resulting return equals `annualMean` (not the
// log-mean) — i.e. E[gross factor] = 1 + annualMean — using the standard lognormal
// correction mu = ln(1+annualMean) - 0.5*sigma^2. periodsPerYear lets the same function
// serve monthly (accumulation replay) or annual (drawdown) sampling: splitting mean/vol
// this way keeps 12 compounded monthly draws statistically equivalent to 1 annual draw.
function sampleLognormalGrossFactor(annualMean, annualVol, periodsPerYear = 1) {
  const muAnnual = Math.log(1 + annualMean) - 0.5 * annualVol * annualVol;
  const muPeriod = muAnnual / periodsPerYear;
  const sigmaPeriod = annualVol / Math.sqrt(periodsPerYear);
  const logReturn = generateGaussianRandom(muPeriod, sigmaPeriod);
  return Math.exp(logReturn);
}

// --- CORE MONTE CARLO STRESS TEST ENGINE ---
// Two upgrades from the earlier version:
//   1. Accumulation-phase sequence-of-returns risk is now modeled. Each of the 1000 trials
//      replays the actual month-by-month contribution schedule (mcAccumulationSchedule from
//      simulateWealth) under its own randomized monthly returns, instead of every trial
//      starting from one fixed deterministic terminalNW. A bad market in year 2 of saving
//      now produces a different retirement starting balance than a bad market in year 20 —
//      that's real risk the old version silently ignored.
//   2. Buckets (pre-tax / Roth / brokerage) are tracked separately all the way through, in
//      both phases, instead of one blended "balance" with a fixed preTaxRatioAtRetirement
//      assumed for the entire 25-year drawdown. This also makes RMD enforcement possible,
//      since RMDs are a pre-tax-bucket-specific rule.
//
// Falls back to the old fixed-starting-balance behavior if mcAccumulationSchedule isn't
// supplied (e.g. an older caller), so this stays backward compatible.
export function runMonteCarloSimulation(state, terminalAccumulatedNW, preTaxRatioAtRetirement = 0.5, mcAccumulationSchedule = null) {
  const iterations = 1000;
  const startAge = state.targetHorizonAge || 65;
  const endAge = 90;
  const totalYears = endAge - startAge;

  const accumMeanReturn = (state.marketYield / 100);
  const accumVolatility = 0.15;
  // Drawdown phase uses the same conservative growth/vol assumption as the deterministic
  // engine (DRAWDOWN_GROWTH_RATE) rather than the full accumulation-phase equity yield —
  // matches the "de-risk in retirement" glide path the deterministic drawdown already
  // assumes, so the two engines tell a consistent story.
  const drawdownMeanReturn = DRAWDOWN_GROWTH_RATE;
  const drawdownVolatility = DRAWDOWN_VOLATILITY;

  const initialAnnualSpending = state.monthlyExpenses * 12;
  const inflationRate = 0.03; // 3% — matches deterministic drawdown chart assumption
  const capitalGainsDrag = (state.capitalGainsDrag ?? 10) / 100;

  // SS offset — same tiered benefit and start-age logic as the deterministic drawdown.
  const mcYearsToRetirement  = Math.max(0, startAge - state.initialAge);
  const mcSalaryAtRetirement = state.grossIncome * Math.pow((1 + (state.annualSalaryGrowth ?? 0) / 100), mcYearsToRetirement);
  const mcSsAnnualBenefit    = estimateSsAnnualBenefit(mcSalaryAtRetirement);
  const mcSsStartAge         = Math.max(startAge, SS_FULL_RETIREMENT_AGE);

  const retirementFilingStatus = state.filingStatus === 'married' ? 'married' : 'single';
  const mcStandardDed = retirementFilingStatus === 'married' ? 32200 : 16100;

  // RMDs — same rule as the deterministic drawdown.
  const birthYear = new Date().getFullYear() - state.initialAge;
  const rmdAgeThreshold = rmdStartAge(birthYear);

  const months = mcAccumulationSchedule?.deltaPreTaxByMonth?.length ?? 0;

  // Store full year-by-year paths for all runs: allPaths[year][run]
  const allPaths = Array.from({ length: totalYears + 1 }, () => []);

  for (let simRun = 0; simRun < iterations; simRun++) {
    // --- PHASE 1 (per-trial): replay accumulation under randomized monthly returns ---
    let preTax, roth, brokerage;
    if (mcAccumulationSchedule && months > 0) {
      preTax    = mcAccumulationSchedule.initialPreTax;
      roth      = mcAccumulationSchedule.initialRoth;
      brokerage = mcAccumulationSchedule.initialBrokerage + (mcAccumulationSchedule.initialHsa || 0);

      for (let m = 0; m < months; m++) {
        const monthlyFactor = sampleLognormalGrossFactor(accumMeanReturn, accumVolatility, 12);
        preTax    *= monthlyFactor;
        roth      *= monthlyFactor;
        brokerage *= monthlyFactor;

        preTax    += mcAccumulationSchedule.deltaPreTaxByMonth[m];
        roth      += mcAccumulationSchedule.deltaRothByMonth[m];
        brokerage += mcAccumulationSchedule.deltaBrokerageByMonth[m] + (mcAccumulationSchedule.deltaHsaByMonth[m] || 0);
      }

      // Cash buffer isn't market-exposed (low-yield, safety money) — folded in as a flat,
      // non-randomized addition, same treatment the deterministic engine gives it.
      brokerage += mcAccumulationSchedule.cashBufferAtRetirement || 0;
      // Any residual consumer debt still outstanding at retirement — rare, but if present
      // it's a fixed subtraction rather than something to randomize.
      brokerage -= mcAccumulationSchedule.debtAtRetirement || 0;
    } else {
      // Fallback: no schedule supplied — behave like the old fixed-starting-point model.
      preTax    = terminalAccumulatedNW * preTaxRatioAtRetirement;
      roth      = 0;
      brokerage = terminalAccumulatedNW * (1 - preTaxRatioAtRetirement);
    }

    let spending = initialAnnualSpending;
    allPaths[0].push(Math.max(0, preTax + roth + brokerage));

    // --- PHASE 2 (per-trial): drawdown with RMDs and 3 separately-taxed buckets ---
    for (let year = 0; year < totalYears; year++) {
      const combinedAssets = preTax + roth + brokerage;

      if (combinedAssets <= 0) {
        preTax = 0; roth = 0; brokerage = 0;
        allPaths[year + 1].push(0);
        continue;
      }

      const currentAge = startAge + year;
      const ssOffset   = currentAge >= mcSsStartAge ? mcSsAnnualBenefit : 0;
      const netAnnualWithdrawal = Math.max(0, spending - ssOffset);

      const preTaxShare    = preTax / combinedAssets;
      const rothShare      = roth / combinedAssets;
      const brokerageShare = brokerage / combinedAssets;

      let preTaxPull    = netAnnualWithdrawal * preTaxShare;
      let rothPull      = netAnnualWithdrawal * rothShare;
      let brokeragePull = netAnnualWithdrawal * brokerageShare;

      // RMD: forces a minimum pre-tax withdrawal starting at age 73/75, regardless of
      // spending need. Excess beyond what was already being pulled is still taxed as
      // ordinary income, then reinvested into brokerage.
      const rmdDivisor = currentAge >= rmdAgeThreshold ? rmdDivisorForAge(currentAge) : null;
      const requiredMinimumDistribution = rmdDivisor ? preTax / rmdDivisor : 0;
      const rmdForcedExcess = Math.max(0, requiredMinimumDistribution - preTaxPull);
      const totalPreTaxGrossWithdrawal = preTaxPull + rmdForcedExcess;

      const taxablePreTax = Math.max(0, totalPreTaxGrossWithdrawal - mcStandardDed);
      const taxOnPreTax   = computeFederalTax(taxablePreTax, retirementFilingStatus);
      const rmdExcessNetOfTax = Math.max(0, rmdForcedExcess - (taxOnPreTax * (rmdForcedExcess / (totalPreTaxGrossWithdrawal || 1))));

      let netPreTaxDeduction    = totalPreTaxGrossWithdrawal + taxOnPreTax;
      let netRothDeduction      = rothPull;
      let netBrokerageDeduction = brokeragePull - rmdExcessNetOfTax;

      // Safety fallbacks if any bucket runs dry — same cascade as the deterministic engine.
      if (preTax < netPreTaxDeduction) {
        const overflow = netPreTaxDeduction - preTax;
        netPreTaxDeduction = preTax;
        const rothOverflow = overflow * (roth / (roth + brokerage + 0.01));
        netRothDeduction      += rothOverflow;
        netBrokerageDeduction += overflow - rothOverflow;
      }
      if (roth < netRothDeduction) {
        const overflow = netRothDeduction - roth;
        netRothDeduction = roth;
        netBrokerageDeduction += overflow;
      }
      if (brokerage < netBrokerageDeduction) {
        const overflow = netBrokerageDeduction - brokerage;
        netBrokerageDeduction = brokerage;
        netPreTaxDeduction += overflow;
      }

      preTax    = Math.max(0, preTax    - netPreTaxDeduction);
      roth      = Math.max(0, roth      - netRothDeduction);
      brokerage = Math.max(0, brokerage - netBrokerageDeduction);

      // Randomized growth — one market draw per year, shared across pre-tax/Roth (same
      // underlying investments, different tax wrapper); brokerage additionally carries
      // the capital-gains drag on realization, same as the deterministic drawdown.
      const randomFactor         = sampleLognormalGrossFactor(drawdownMeanReturn, drawdownVolatility, 1);
      const randomReturn         = randomFactor - 1;
      const brokerageRandomFactor = 1 + randomReturn * (1 - capitalGainsDrag);

      if (preTax > 0)    preTax    *= randomFactor;
      if (roth > 0)      roth      *= randomFactor;
      if (brokerage > 0) brokerage *= brokerageRandomFactor;

      spending *= (1 + inflationRate);

      allPaths[year + 1].push(Math.max(0, preTax + roth + brokerage));
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
