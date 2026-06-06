import { formatShortDate, addMonths } from '../utils/dates.js';

export function computeDebtPaydown(state, savingsMargin) {
  const today = new Date();
  let currentDebt = state.consumerDebt;
  const monthlyDebtPayment = savingsMargin;
  let monthsToDebtFree = 0;
  let totalDebtInterestFriction = 0;
  const monthlyDebtApr = (state.debtApr / 100) / 12;
  let canPayOff = true;

  if (currentDebt > 0) {
    if (monthlyDebtPayment <= 0 || monthlyDebtPayment <= currentDebt * monthlyDebtApr) {
      canPayOff = false;
    } else {
      while (currentDebt > 0 && monthsToDebtFree < 600) {
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
  };
}
