import { formatShortDate, addMonths } from '../utils/dates.js';

export function computeEmergencyRunway(state, cashflow, debt) {
  const monthlyBurn = state.monthlyExpenses || 1;

  // Use the same cash figure the wealth simulation seeds into simCashBuffer:
  // cash above the buffer target gets redeployed to brokerage at sim start,
  // so it shouldn't count toward the emergency fund here.
  const cashBufferTarget = (state.cashBufferMonths ?? 3) * monthlyBurn;
  const effectiveCash = Math.min(state.cash, cashBufferTarget);

  const emergencyMonths = effectiveCash / monthlyBurn;
  const neededFor6Mo = (monthlyBurn * 6) - effectiveCash;
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
