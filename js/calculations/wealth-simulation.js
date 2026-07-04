import { COAST_FI_REFERENCE_AGE, DRAWDOWN_GROWTH_RATE, DRAWDOWN_VOLATILITY, DRAWDOWN_INFLATION_RATE, DRAWDOWN_END_AGE, CASH_BUFFER_YIELD, estimateSsAnnualBenefit, SS_FULL_RETIREMENT_AGE, STANDARD_DEDUCTION, MAX_401K_INDIVIDUAL, MAX_401K_CATCHUP_50, MAX_401K_CATCHUP_60_63, MAX_ANNUAL_ADDITIONS, rmdStartAge, rmdDivisorForAge, getStateTaxRate, ssTaxableFraction, computeCapitalGainsRate } from '../config/constants.js';
import { computeFederalTax } from '../config/tax-brackets-2026.js';
import { computeAnnualFica } from './tax.js';

// --- AVERAGE-COST BASIS TRACKING ---
// Applies a net cash flow to a taxable brokerage balance while keeping its cost basis
// (the portion that's principal, not gain) accurate under average-cost accounting:
//   - A contribution (flow > 0) adds dollar-for-dollar to both balance and basis — new
//     money in isn't a gain yet.
//   - A withdrawal/sale (flow < 0) removes the SAME fraction of basis as of balance —
//     e.g. selling 10% of the account realizes 10% of the account's basis and 10% of
//     its embedded gain, not a disproportionate chunk of either.
// This replaces the old flat "capital gains drag %" applied to the whole balance/yield,
// which taxed your own contributed principal as if it were a gain.
function applyBrokerageFlow(balance, costBasis, flow) {
  if (flow >= 0) {
    return { balance: balance + flow, costBasis: costBasis + flow };
  }
  const sellFraction = balance > 0 ? Math.min(1, -flow / balance) : 0;
  return { balance: balance + flow, costBasis: costBasis * (1 - sellFraction) };
}

export function simulateWealth(state, deps) {
  const { tax, cashflow, debt, runway, fi } = deps;
  const { fiTargetNumber, annualYield } = fi;
  // Capital gains rate (federal LTCG + NIIT + state) is now computed FRESH each drawdown
  // year from that year's actual ordinary income, not held as one static rate for the
  // whole horizon — see computeCapitalGainsRate usage inside the drawdown loop below.

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
  // Cost basis: the portion of simBrokeragePool that's principal, not gain. We have no way
  // to know your real embedded gain without asking, and that's a level of detail most people
  // don't want to enter — so this assumes zero embedded gain on your starting balance
  // (optimistic: real tax owed on this specific chunk may be somewhat higher once you sell).
  // Every dollar contributed FROM HERE ON is tracked precisely, so the approximation only
  // ever applies to today's existing balance, not future growth.
  let simBrokerageCostBasis = state.brokerage;
  let simHsaPool = state.hsaBalance || 0;
  // Cash Buffer — liquid savings/HYSA (low yield, capped target)
  // Seed with existing cash balance; target cap = cashBufferMonths x monthly expenses
  const cashBufferTarget = (state.cashBufferMonths ?? 3) * (state.monthlyExpenses || 0);
  let simCashBuffer = Math.min(state.cash, cashBufferTarget);
  // Any cash above the buffer target starts in brokerage
  simBrokeragePool += Math.max(0, state.cash - cashBufferTarget);
  // Cash rolled into brokerage is pure principal — no embedded gain — so it's basis too.
  simBrokerageCostBasis += Math.max(0, state.cash - cashBufferTarget);

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
  const mcInitialBrokerageCostBasis = simBrokerageCostBasis;
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
            const brokerageFlow = remainder * investmentRate;
            ({ balance: simBrokeragePool, costBasis: simBrokerageCostBasis } =
              applyBrokerageFlow(simBrokeragePool, simBrokerageCostBasis, brokerageFlow));
            mcDeltaBrokerage += brokerageFlow;
            // The uninvested fraction (lifestyle creep / irregular spend) is simply not added
          }
        } else {
          // Buffer is full — apply investment rate to full surplus
          const brokerageFlow = grownSavingsMargin * investmentRate;
          ({ balance: simBrokeragePool, costBasis: simBrokerageCostBasis } =
            applyBrokerageFlow(simBrokeragePool, simBrokerageCostBasis, brokerageFlow));
          mcDeltaBrokerage += brokerageFlow;
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
          const brokerageFlow = remainingDeficit;
          const preFlowBrokerage = simBrokeragePool;
          ({ balance: simBrokeragePool, costBasis: simBrokerageCostBasis } =
            applyBrokerageFlow(simBrokeragePool, simBrokerageCostBasis, brokerageFlow));
          if (simBrokeragePool < 0) {
            remainingDeficit = simBrokeragePool;
            simBrokeragePool = 0;
          } else {
            remainingDeficit = 0;
          }
          // Record only the REALIZED (post-clamp) change, not the full requested flow —
          // otherwise the MC schedule replay overdraws this bucket past zero whenever a
          // deficit exceeds what's actually available, and that error compounds every
          // subsequent month (confirmed: produced a -$262k phantom brokerage balance in
          // a persistent-deficit test scenario before this fix).
          mcDeltaBrokerage += (simBrokeragePool - preFlowBrokerage);
        }

        if (remainingDeficit < 0) {
          const preFlowRoth = simRothPool;
          simRothPool += remainingDeficit;
          if (simRothPool < 0) {
            remainingDeficit = simRothPool;
            simRothPool = 0;
          } else {
            remainingDeficit = 0;
          }
          mcDeltaRoth += (simRothPool - preFlowRoth);
        }

        if (remainingDeficit < 0) {
          const preFlowPreTax = simPreTaxPool;
          simPreTaxPool += remainingDeficit;
          if (simPreTaxPool < 0) simPreTaxPool = 0;
          mcDeltaPreTax += (simPreTaxPool - preFlowPreTax);
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
  // At retirement, fold cash buffer into brokerage (liquid, non-retirement money — pure
  // principal, correctly tax-free) and fold HSA into the PRE-TAX bucket instead.
  // HSA growth is only tax-free if spent on qualified medical expenses — this model can't
  // distinguish that from general retirement spending, so treating merged HSA money as
  // ordinary-income-taxed (like a traditional IRA) on withdrawal is the conservative
  // assumption, not the tax-free one. (One accepted simplification: real HSAs aren't
  // subject to RMDs, but folding it into the pre-tax bucket means it's included in the RMD
  // base here — a minor simplification that leans toward MORE tax paid, not less, so it
  // doesn't fight the "stay conservative" goal.)
  let drawdownPreTaxBucket    = simPreTaxPool + simHsaPool;
  let drawdownRothBucket      = simRothPool;
  let drawdownBrokerageBucket = simBrokeragePool + simCashBuffer;
  // Cash buffer is pure principal when it lands here — no embedded gain — so it adds
  // straight to cost basis. HSA no longer flows through here at all (see above).
  let drawdownBrokerageCostBasis = simBrokerageCostBasis + simCashBuffer;

  // Inflate expenses forward to retirement age as starting drawdown spending baseline
  const drawdownAccumYears    = targetHorizonAge - state.initialAge;
  const expenseGrowthRateD    = (state.annualExpenseGrowth ?? 0) / 100;
  let indexedAnnualSpendingRequirement =
    state.monthlyExpenses * Math.pow(1 + expenseGrowthRateD, Math.max(0, drawdownAccumYears)) * 12;

  // Social Security: real AIME/bend-point estimate built from your simulated earnings
  // trajectory (back-cast + forward-cast around today's income), not a single-year proxy.
  // See estimateSsAnnualBenefit / buildSyntheticEarningsHistory in constants.js.
  const ssAnnualBenefit     = estimateSsAnnualBenefit(state);
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
    const brokerageNetTarget = netAnnualWithdrawal * brokerageShare;

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

    // Tax on pre-tax withdrawals — Roth is tax-free at withdrawal, brokerage is handled
    // separately below via cost-basis-aware capital gains.
    const retirementStatus = state.filingStatus === 'married' ? 'married' : 'single';
    const standardDed = retirementStatus === 'married' ? 32200 : 16100;

    // Social Security taxability: federal law taxes up to 85% of SS based on a combined-
    // income test (portfolio withdrawal income + 50% of the SS benefit). Previously SS was
    // treated as entirely tax-free, which understates federal tax in every year SS is drawn.
    const ssTaxableFrac = ssOffset > 0 ? ssTaxableFraction(totalPreTaxGrossWithdrawal, ssOffset, retirementStatus) : 0;
    const taxableSsIncome = ssOffset * ssTaxableFrac;

    // Subtract standard deduction first: first $16,100 (single) / $32,200 (married) is tax-free
    const federalTaxableIncome = Math.max(0, (totalPreTaxGrossWithdrawal + taxableSsIncome) - standardDed);
    const federalTaxOnWithdrawal = computeFederalTax(federalTaxableIncome, retirementStatus);

    // State tax — previously missing entirely from retirement withdrawals (federal-only).
    // Applied only to the portfolio-withdrawal portion, not the SS benefit — most states
    // with an income tax (including Michigan, 4.25% flat) exempt SS from state tax outright.
    const stateRate = getStateTaxRate(state);
    const stateTaxOnWithdrawal = totalPreTaxGrossWithdrawal * stateRate;

    const taxOnPreTax = federalTaxOnWithdrawal + stateTaxOnWithdrawal;

    // --- Capital gains: tax only the realized-gain portion, using real cost basis ---
    // Recalculated fresh EVERY YEAR from that year's actual ordinary income (RMD + taxable
    // SS) rather than a single rate held constant for the whole drawdown horizon — ordinary
    // income shifts a lot over 25+ years (e.g. dropping once RMDs taper off in your 80s),
    // so the LTCG bracket and NIIT exposure should move with it, same as the ordinary-income
    // tax above already does.
    const totalOrdinaryIncomeThisYear = totalPreTaxGrossWithdrawal + taxableSsIncome;
    const capitalGainsRateThisYear = computeCapitalGainsRate(totalOrdinaryIncomeThisYear, standardDed, retirementStatus, state);
    // gainFraction is the share of the CURRENT balance that's unrealized gain (average-cost
    // method — selling X% of the account realizes X% of its basis and X% of its gain, not
    // a disproportionate share of either). Only that gain fraction of what's sold is taxed
    // at this year's derived LTCG+NIIT+state rate; the rest is just your own principal
    // coming back.
    const brokerageGainFraction = drawdownBrokerageBucket > 0
      ? Math.max(0, 1 - (drawdownBrokerageCostBasis / drawdownBrokerageBucket))
      : 0;
    const brokerageTaxDrag = brokerageGainFraction * capitalGainsRateThisYear;
    // Gross up the NET target into a gross sale amount: sell enough that, after tax on
    // just the gain portion of the sale, brokerageNetTarget dollars are left to spend.
    let brokeragePull = brokerageTaxDrag < 1
      ? brokerageNetTarget / (1 - brokerageTaxDrag)
      : brokerageNetTarget;

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
    // Cost basis moves with the final (post-fallback) net flow: a net removal sells that
    // fraction of basis (average-cost); a net addition (e.g. RMD reinvestment exceeding
    // the planned brokerage pull) is fresh principal, added to basis dollar-for-dollar.
    ({ balance: drawdownBrokerageBucket, costBasis: drawdownBrokerageCostBasis } =
      applyBrokerageFlow(drawdownBrokerageBucket, drawdownBrokerageCostBasis, -netBrokerageDeduction));
    drawdownBrokerageBucket = Math.max(0, drawdownBrokerageBucket);

    drawdownTimelineData.push({
      age:        drawdownAge,
      totalWealth: drawdownPreTaxBucket + drawdownRothBucket + drawdownBrokerageBucket,
      preTax:     drawdownPreTaxBucket,
      roth:       drawdownRothBucket,
      brokerage:  drawdownBrokerageBucket,
    });

    drawdownPreTaxBucket    *= (1 + DRAWDOWN_GROWTH_RATE);
    drawdownRothBucket      *= (1 + DRAWDOWN_GROWTH_RATE);
    // Brokerage now compounds at the FULL growth rate — tax is only owed on realized gains
    // at withdrawal (handled above via cost basis), not annually on unrealized appreciation.
    drawdownBrokerageBucket *= (1 + DRAWDOWN_GROWTH_RATE);
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
    initialBrokerageCostBasis: mcInitialBrokerageCostBasis,
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
  // Capital gains rate is now computed fresh each drawdown year (see loop below), not
  // held as one static rate for the whole horizon.

  // SS offset — same real AIME/bend-point estimate as the deterministic drawdown.
  const mcSsAnnualBenefit    = estimateSsAnnualBenefit(state);
  const mcSsStartAge         = Math.max(startAge, SS_FULL_RETIREMENT_AGE);

  const retirementFilingStatus = state.filingStatus === 'married' ? 'married' : 'single';
  const mcStandardDed = retirementFilingStatus === 'married' ? 32200 : 16100;
  // State tax rate for retirement withdrawals — was referenced below but never declared,
  // which is what just broke the whole calculation. Fixed now.
  const mcStateRate = getStateTaxRate(state);

  // RMDs — same rule as the deterministic drawdown.
  const birthYear = new Date().getFullYear() - state.initialAge;
  const rmdAgeThreshold = rmdStartAge(birthYear);

  const months = mcAccumulationSchedule?.deltaPreTaxByMonth?.length ?? 0;

  // Store full year-by-year paths for all runs: allPaths[year][run]
  const allPaths = Array.from({ length: totalYears + 1 }, () => []);

  for (let simRun = 0; simRun < iterations; simRun++) {
    // --- PHASE 1 (per-trial): replay accumulation under randomized monthly returns ---
    let preTax, roth, brokerage, brokerageCostBasis;
    if (mcAccumulationSchedule && months > 0) {
      // HSA merges into the PRE-TAX bucket (ordinary income tax on withdrawal), not
      // brokerage — see the deterministic engine's identical treatment and the
      // medical-expense caveat noted there. All four buckets grow at the same rate during
      // accumulation, so this merge is exact, not an approximation.
      preTax    = mcAccumulationSchedule.initialPreTax + (mcAccumulationSchedule.initialHsa || 0);
      roth      = mcAccumulationSchedule.initialRoth;
      brokerage = mcAccumulationSchedule.initialBrokerage;
      brokerageCostBasis = mcAccumulationSchedule.initialBrokerageCostBasis ?? mcAccumulationSchedule.initialBrokerage;

      for (let m = 0; m < months; m++) {
        const monthlyFactor = sampleLognormalGrossFactor(accumMeanReturn, accumVolatility, 12);
        preTax    *= monthlyFactor;
        roth      *= monthlyFactor;
        brokerage *= monthlyFactor;

        preTax += mcAccumulationSchedule.deltaPreTaxByMonth[m] + (mcAccumulationSchedule.deltaHsaByMonth[m] || 0);
        roth   += mcAccumulationSchedule.deltaRothByMonth[m];
        const brokerageFlow = mcAccumulationSchedule.deltaBrokerageByMonth[m];
        ({ balance: brokerage, costBasis: brokerageCostBasis } = applyBrokerageFlow(brokerage, brokerageCostBasis, brokerageFlow));

        // The delta schedule is a FIXED dollar-amount path computed once from the
        // deterministic (expected-return) run. It's exactly right for contributions
        // (a fixed % of salary doesn't depend on market luck), but a deficit-withdrawal
        // month can still overdraw a bucket in an unlucky trial whose actual balance,
        // after a run of poor random returns, is lower than the deterministic path's was
        // at that same point — even though the deterministic schedule itself never
        // overdraws (verified separately by the zero-volatility replay check). Floor each
        // bucket at zero here, same as the deterministic engine does, rather than letting
        // an impossible negative balance persist and keep compounding.
        if (preTax < 0)    { preTax = 0; }
        if (roth < 0)      { roth = 0; }
        if (brokerage < 0) { brokerage = 0; brokerageCostBasis = 0; }
      }

      // Cash buffer isn't market-exposed (low-yield, safety money) — folded in as a flat,
      // non-randomized addition, same treatment the deterministic engine gives it. It's
      // pure principal, so it's basis too.
      brokerage           += mcAccumulationSchedule.cashBufferAtRetirement || 0;
      brokerageCostBasis  += mcAccumulationSchedule.cashBufferAtRetirement || 0;
      // Any residual consumer debt still outstanding at retirement — rare, but if present
      // it's a fixed subtraction rather than something to randomize.
      brokerage -= mcAccumulationSchedule.debtAtRetirement || 0;
    } else {
      // Fallback: no schedule supplied — behave like the old fixed-starting-point model.
      // No basis information available in this fallback path, so assume zero embedded
      // gain (matches the same "no data, assume none" default used elsewhere).
      preTax    = terminalAccumulatedNW * preTaxRatioAtRetirement;
      roth      = 0;
      brokerage = terminalAccumulatedNW * (1 - preTaxRatioAtRetirement);
      brokerageCostBasis = brokerage;
    }

    let spending = initialAnnualSpending;
    allPaths[0].push(Math.max(0, preTax + roth + brokerage));

    // --- PHASE 2 (per-trial): drawdown with RMDs, cost-basis-aware cap gains, 3 buckets ---
    for (let year = 0; year < totalYears; year++) {
      const combinedAssets = preTax + roth + brokerage;

      if (combinedAssets <= 0) {
        preTax = 0; roth = 0; brokerage = 0; brokerageCostBasis = 0;
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
      const brokerageNetTarget = netAnnualWithdrawal * brokerageShare;

      // RMD: forces a minimum pre-tax withdrawal starting at age 73/75, regardless of
      // spending need. Excess beyond what was already being pulled is still taxed as
      // ordinary income, then reinvested into brokerage.
      const rmdDivisor = currentAge >= rmdAgeThreshold ? rmdDivisorForAge(currentAge) : null;
      const requiredMinimumDistribution = rmdDivisor ? preTax / rmdDivisor : 0;
      const rmdForcedExcess = Math.max(0, requiredMinimumDistribution - preTaxPull);
      const totalPreTaxGrossWithdrawal = preTaxPull + rmdForcedExcess;

      // Social Security taxability + state tax — same treatment as the deterministic
      // drawdown (previously missing here too: federal-only tax, SS treated as tax-free).
      const mcSsTaxableFrac = ssOffset > 0 ? ssTaxableFraction(totalPreTaxGrossWithdrawal, ssOffset, retirementFilingStatus) : 0;
      const mcTaxableSsIncome = ssOffset * mcSsTaxableFrac;
      const federalTaxableIncome = Math.max(0, (totalPreTaxGrossWithdrawal + mcTaxableSsIncome) - mcStandardDed);
      const federalTaxOnWithdrawal = computeFederalTax(federalTaxableIncome, retirementFilingStatus);
      const stateTaxOnWithdrawal = totalPreTaxGrossWithdrawal * mcStateRate;
      const taxOnPreTax = federalTaxOnWithdrawal + stateTaxOnWithdrawal;

      // Cost-basis-aware capital gains: recalculated fresh EVERY YEAR from that year's
      // actual ordinary income (RMD + taxable SS), same as the deterministic drawdown —
      // not one static rate held constant across the whole horizon.
      const totalOrdinaryIncomeThisYear = totalPreTaxGrossWithdrawal + mcTaxableSsIncome;
      const capitalGainsRateThisYear = computeCapitalGainsRate(totalOrdinaryIncomeThisYear, mcStandardDed, retirementFilingStatus, state);
      const brokerageGainFraction = brokerage > 0
        ? Math.max(0, 1 - (brokerageCostBasis / brokerage))
        : 0;
      const brokerageTaxDrag = brokerageGainFraction * capitalGainsRateThisYear;
      let brokeragePull = brokerageTaxDrag < 1
        ? brokerageNetTarget / (1 - brokerageTaxDrag)
        : brokerageNetTarget;

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

      preTax = Math.max(0, preTax - netPreTaxDeduction);
      roth   = Math.max(0, roth   - netRothDeduction);
      ({ balance: brokerage, costBasis: brokerageCostBasis } =
        applyBrokerageFlow(brokerage, brokerageCostBasis, -netBrokerageDeduction));
      brokerage = Math.max(0, brokerage);

      // Randomized growth — one market draw per year, shared across pre-tax/Roth (same
      // underlying investments, different tax wrapper). Brokerage compounds at the full
      // rate now — tax is only owed on realized gains at withdrawal (handled above via
      // cost basis), not annually on unrealized appreciation.
      const randomFactor = sampleLognormalGrossFactor(drawdownMeanReturn, drawdownVolatility, 1);

      if (preTax > 0)    preTax    *= randomFactor;
      if (roth > 0)      roth      *= randomFactor;
      if (brokerage > 0) brokerage *= randomFactor;

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
