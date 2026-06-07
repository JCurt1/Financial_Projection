import { COAST_FI_REFERENCE_AGE } from '../config/constants.js';

export function simulateWealth(state, deps) {
  const { tax, cashflow, debt, runway, fi } = deps;
  const { fiTargetNumber, liquidPortfolioPool, annualYield } = fi;

  const currentSimulationAge = state.initialAge;
  
  // FIX: Extract target horizon dynamically from central state, falling back to 60 if not yet set
  const targetHorizonAge = state.targetHorizonAge || 60; 
  
  const monthlyDebtApr = debt.monthlyDebtApr;
  const calculatedSavingsMargin = cashflow.savingsMargin;
  const monthsToDebtFree = debt.monthsToDebtFree;
  const debtCanBePaidOff = debt.canPayOff;
  const emergencyMonths = runway.emergencyMonths;
  const neededFor6Mo = runway.neededFor6Mo;

  const labelsCollection = [];
  const trajectoryCollection = [];

  let currentCompoundingNW = liquidPortfolioPool;
  let simCash = state.cash;
  let simBrokerage = state.brokerage;
  let simRetirement = state.retirement;
  let simDebt = state.consumerDebt;

  // This loop now accurately tracks whatever age gap the user specifies
  let loopsTotal = targetHorizonAge - currentSimulationAge;
  if (loopsTotal <= 0) loopsTotal = 1;

  labelsCollection.push('Age ' + currentSimulationAge);
  trajectoryCollection.push(currentCompoundingNW);

  const totalInflowEmployer401k = tax.totalInflowEmployer401k;
  let simulationMonthsOffset = 0;
  let absoluteFiAchievedAge = null;
  let absoluteCoastAchievedAge = null;

  for (let currentYearIndex = 1; currentYearIndex <= loopsTotal; currentYearIndex++) {
    const activeTimelineAge = currentSimulationAge + currentYearIndex;

    for (let monthBlock = 0; monthBlock < 12; monthBlock++) {
      simulationMonthsOffset++;

      simRetirement *= (1 + annualYield / 12);
      simBrokerage *= (1 + annualYield / 12);

      let waterfallActivePhase = 'debt';
      if (state.consumerDebt <= 0 || (debtCanBePaidOff && simulationMonthsOffset > monthsToDebtFree)) {
        waterfallActivePhase = 'runway';
      }
      if (emergencyMonths >= 6 || (waterfallActivePhase === 'runway' &&
          (simulationMonthsOffset - monthsToDebtFree) * calculatedSavingsMargin >= neededFor6Mo)) {
        waterfallActivePhase = 'investing';
      }

      simRetirement += (totalInflowEmployer401k / 12);

      if (simDebt > 0 && calculatedSavingsMargin > 0) {
        const debtInterest = simDebt * monthlyDebtApr;
        simDebt += debtInterest - calculatedSavingsMargin;
        if (simDebt < 0) {
          simBrokerage += Math.abs(simDebt);
          simDebt = 0;
        }
      } else if (simDebt <= 0 && calculatedSavingsMargin > 0) {
        simBrokerage += calculatedSavingsMargin;
      } else if (calculatedSavingsMargin < 0) {
        let remainingDeficit = calculatedSavingsMargin;

        simBrokerage += remainingDeficit;
        if (simBrokerage < 0) {
          remainingDeficit = simBrokerage;
          simBrokerage = 0;
        } else {
          remainingDeficit = 0;
        }

        if (remainingDeficit < 0) {
          simCash += remainingDeficit;
          if (simCash < 0) {
            remainingDeficit = simCash;
            simCash = 0;
          } else {
            remainingDeficit = 0;
          }
        }

        if (remainingDeficit < 0) {
          simRetirement += remainingDeficit;
          if (simRetirement < 0) simRetirement = 0;
        }
      }

      if (simDebt > 0 && calculatedSavingsMargin <= 0) {
        simDebt += (simDebt * monthlyDebtApr);
      }

      currentCompoundingNW = simCash + simBrokerage + simRetirement - simDebt;

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
  const compoundingGrowthGain = terminalNetWorthResult - liquidPortfolioPool;

  return {
    growthLabels: labelsCollection,
    growthData: trajectoryCollection,
    terminalNW: terminalNetWorthResult,
    gain: compoundingGrowthGain,
    absoluteFiAchievedAge,
    absoluteCoastAchievedAge,
    targetHorizonAge, // Passes the dynamic age directly out to computeAll
  };
}
