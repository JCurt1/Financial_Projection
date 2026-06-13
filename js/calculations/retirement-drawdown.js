import {
  DRAWDOWN_GROWTH_RATE,
  DRAWDOWN_INITIAL_WITHDRAWAL_RATE,
  DRAWDOWN_INFLATION_RATE,
  DEFAULT_TARGET_HORIZON_AGE,
  DRAWDOWN_END_AGE,
} from '../config/constants.js';

/**
 * NOTE: This function is not currently used. The drawdown chart is driven entirely by
 * simulateWealth() in wealth-simulation.js, which produces drawdownTimelineData with
 * full tax-bucket detail, inflation-adjusted spending, and SS offsets.
 * Do not wire this up without first aligning it to that baseline — it lacks:
 *   - expense inflation forward to retirement age
 *   - Social Security offset
 *   - per-bucket (pre-tax / Roth / brokerage) tracking
 *
 * Simulates retirement drawdown trajectory dynamically based on user retirement age.
 * @param {number} terminalNetWorth - Nest egg portfolio balance at retirement.
 * @param {number} [userStartAge] - The actual chosen retirement start age.
 * @param {number} [monthlyExpenses] - Current monthly expenses (NOT inflation-adjusted to retirement).
 *   If provided, uses real spending as the withdrawal baseline.
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
  // Order: withdraw first, then grow — matches wealth-simulation.js drawdown
  // and the conventional safe withdrawal rate (SWR) approach.
  for (let currentAgeTracker = actualStartAge + 1; currentAgeTracker <= actualEndAge; currentAgeTracker++) {
    if (drawPool > 0) {
      currentYearlyWithdrawal *= (1 + DRAWDOWN_INFLATION_RATE);
      drawPool -= currentYearlyWithdrawal;
      if (drawPool < 0) drawPool = 0;
      drawPool *= (1 + DRAWDOWN_GROWTH_RATE);
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
