import {
  DRAWDOWN_GROWTH_RATE,
  DRAWDOWN_INITIAL_WITHDRAWAL_RATE,
  DRAWDOWN_INFLATION_RATE,
  DEFAULT_TARGET_HORIZON_AGE,
  DRAWDOWN_END_AGE,
} from '../config/constants.js';

/**
 * Simulates retirement drawdown trajectory dynamically based on user retirement age.
 * @param {number} terminalNetWorth - Nest egg portfolio balance at retirement.
 * @param {number} [userStartAge] - The actual chosen retirement start age.
 * @param {number} [monthlyExpenses] - Actual monthly expenses from user input.
 *   If provided, uses real spending as the withdrawal baseline (consistent with wealth simulation).
 *   Falls back to the 4% rule if not provided.
 */
export function simulateDrawdown(terminalNetWorth, userStartAge, monthlyExpenses) {
  const drawdownLabels = [];
  const drawdownTrajectory = [];

  // 1. Determine the actual starting age (use custom input, or fallback to default constant)
  const actualStartAge = userStartAge !== undefined ? Number(userStartAge) : DEFAULT_TARGET_HORIZON_AGE;

  // 2. Maintain a standard 30-year projection window horizon relative to the new start age
  const defaultHorizon = DRAWDOWN_END_AGE - DEFAULT_TARGET_HORIZON_AGE;
  const actualEndAge = actualStartAge + defaultHorizon;

  let drawPool = Math.max(terminalNetWorth, 0);

  // 3. Use actual annual expenses if provided, otherwise fall back to 4% rule.
  //    This keeps the chart consistent with what the wealth simulation calculated.
  const initialWithdrawalAmount = (monthlyExpenses && monthlyExpenses > 0)
    ? monthlyExpenses * 12
    : drawPool * DRAWDOWN_INITIAL_WITHDRAWAL_RATE;

  let currentYearlyWithdrawal = initialWithdrawalAmount;

  // Push baseline year data
  drawdownLabels.push('Age ' + actualStartAge);
  drawdownTrajectory.push(drawPool);

  // 4. Dynamic boundaries loop execution
  for (let currentAgeTracker = actualStartAge + 1; currentAgeTracker <= actualEndAge; currentAgeTracker++) {
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
    startAge: actualStartAge,
    endAge: actualEndAge
  };
}
