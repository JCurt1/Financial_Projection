import { formatShortDate, addMonths } from '../utils/dates.js';

export function computeDebtPaydown(state, savingsMargin) {
  const today = new Date();
  let currentDebt = state.consumerDebt;
  let monthsToDebtFree = 0;
  let totalDebtInterestFriction = 0;
  const monthlyDebtApr = (state.debtApr / 100) / 12;
  const salaryGrowthRate  = (state.annualSalaryGrowth  ?? 0) / 100;
  const expenseGrowthRate = (state.annualExpenseGrowth ?? 0) / 100;
  let canPayOff = true;

  if (currentDebt > 0) {
    // Check payability against year-1 margin first — if can't afford it now, never will
    if (savingsMargin <= 0 || savingsMargin <= currentDebt * monthlyDebtApr) {
      canPayOff = false;
    } else {
      let yearIndex = 0;
      while (currentDebt > 0 && monthsToDebtFree < 600) {
        // Recompute grown monthly payment at the start of each new year
        yearIndex = Math.floor(monthsToDebtFree / 12);
        const grownSalaryFactor   = Math.pow(1 + salaryGrowthRate,  yearIndex);
        const grownExpenseFactor  = Math.pow(1 + expenseGrowthRate, yearIndex);
        // Grown margin = (base takehome * salary growth) - (base expenses * expense growth)
        // We approximate by scaling the surplus and expense components of savingsMargin separately.
        // baseTakehome = savingsMargin + monthlyExpenses; expenses grow independently.
        const baseTakehome       = savingsMargin + state.monthlyExpenses;
        const grownTakehome      = baseTakehome * grownSalaryFactor;
        const grownExpenses      = state.monthlyExpenses * grownExpenseFactor;
        const monthlyDebtPayment = grownTakehome - grownExpenses;

        if (monthlyDebtPayment <= currentDebt * monthlyDebtApr) {
          canPayOff = false;
          break;
        }

        const interestAccrual = currentDebt * monthlyDebtApr;
        totalDebtInterestFriction += interestAccrual;
        currentDebt += interestAccrual - monthlyDebtPayment;
        monthsToDebtFree++;
        if (currentDebt <= 0) break;
      }
      if (currentDebt > 0) {
        canPayOff = false;
      }
    }
  }

  const isComplete = state.consumerDebt <= 0;

  let freeDateLabel = '—';
  let monthsLabel = '—';
  let interestLabel = '—';
  let nodeClassName = 'timeline-node phase-debt';
  let statusLabel = 'Locked';
  let dateLabel = '—';

  if (isComplete) {
    freeDateLabel = 'Immediate';
    monthsLabel = '0';
    interestLabel = '$0';
    nodeClassName = 'timeline-node phase-debt complete';
    statusLabel = 'Complete';
    dateLabel = formatShortDate(today);
  } else if (!canPayOff) {
    freeDateLabel = 'Never';
    monthsLabel = '∞';
    interestLabel = 'Escalating';
    nodeClassName = 'timeline-node phase-debt active';
    statusLabel = 'Stalled';
    dateLabel = '—';
  } else {
    const targetDate = addMonths(today, monthsToDebtFree);
    freeDateLabel = formatShortDate(targetDate);
    monthsLabel = String(monthsToDebtFree);
    interestLabel = null; // formatted by UI
    nodeClassName = 'timeline-node phase-debt active';
    statusLabel = 'Active';
    dateLabel = freeDateLabel;
  }

  return {
    monthsToDebtFree,
    totalDebtInterestFriction,
    canPayOff,
    isComplete,
    freeDateLabel,
    monthsLabel,
    interestLabel,
    nodeClassName,
    statusLabel,
    dateLabel,
    monthlyDebtApr,
	consumerDebt: state.consumerDebt,
  };
}
