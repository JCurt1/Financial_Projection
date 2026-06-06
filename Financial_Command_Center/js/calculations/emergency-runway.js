import { formatShortDate, addMonths } from '../utils/dates.js';

export function computeEmergencyRunway(state, cashflow, debt) {
  const monthlyBurn = state.monthlyExpenses || 1;
  const emergencyMonths = state.cash / monthlyBurn;
  const neededFor6Mo = (monthlyBurn * 6) - state.cash;
  const isFunded = emergencyMonths >= 6;

  let nodeClassName = 'timeline-node phase-runway';
  let statusLabel = 'Locked';
  let dateLabel = '—';
  let replenishMonthsLabel = '—';

  if (isFunded) {
    nodeClassName = 'timeline-node phase-runway complete';
    statusLabel = 'Safe';
    dateLabel = 'Active';
    replenishMonthsLabel = 'Fully Funded';
  } else {
    nodeClassName = 'timeline-node phase-runway active';
    statusLabel = 'Seeding';
    if (cashflow.savingsMargin > 0 && debt.canPayOff) {
      const monthsToBuildRunway = Math.ceil(neededFor6Mo / cashflow.savingsMargin) +
        (state.consumerDebt > 0 ? debt.monthsToDebtFree : 0);
      const runwayTargetDate = addMonths(new Date(), monthsToBuildRunway);
      dateLabel = formatShortDate(runwayTargetDate);
      replenishMonthsLabel = monthsToBuildRunway + ' mo';
    } else {
      dateLabel = '—';
      replenishMonthsLabel = 'Insufficient Margin';
    }
  }

  return {
    emergencyMonths,
    neededFor6Mo,
    isFunded,
    nodeClassName,
    statusLabel,
    dateLabel,
    replenishMonthsLabel,
  };
}
