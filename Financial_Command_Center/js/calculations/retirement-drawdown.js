import {
  DRAWDOWN_GROWTH_RATE,
  DRAWDOWN_INITIAL_WITHDRAWAL_RATE,
  DRAWDOWN_INFLATION_RATE,
  DRAWDOWN_START_AGE,
  DRAWDOWN_END_AGE,
} from '../config/constants.js';

export function simulateDrawdown(terminalNetWorth) {
  const drawdownLabels = [];
  const drawdownTrajectory = [];

  let drawPool = Math.max(terminalNetWorth, 0);
  let initialWithdrawalAmount = drawPool * DRAWDOWN_INITIAL_WITHDRAWAL_RATE;
  let currentYearlyWithdrawal = initialWithdrawalAmount;

  drawdownLabels.push('Age ' + DRAWDOWN_START_AGE);
  drawdownTrajectory.push(drawPool);

  for (let currentAgeTracker = DRAWDOWN_START_AGE + 1; currentAgeTracker <= DRAWDOWN_END_AGE; currentAgeTracker++) {
    if (drawPool > 0) {
      drawPool *= (1 + DRAWDOWN_GROWTH_RATE);
      currentYearlyWithdrawal *= (1 + DRAWDOWN_INFLATION_RATE);
      drawPool -= currentYearlyWithdrawal;
      if (drawPool < 0) drawPool = 0;
    } else {
      drawPool = 0;
    }

    drawdownLabels.push('Age ' + currentAgeTracker);
    drawdownTrajectory.push(drawPool);
  }

  return {
    labels: drawdownLabels,
    data: drawdownTrajectory,
  };
}
