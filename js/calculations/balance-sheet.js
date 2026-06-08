export function computeBalanceSheet(state) {
  const totalAssets =
  state.cash +
  state.retirement +
  state.homeValue +
  state.brokerage +
  (state.hsaBalance || 0);
  const totalLiabilities = state.consumerDebt + state.mortgage;
  const netWorth = totalAssets - totalLiabilities;

  return { totalAssets, totalLiabilities, netWorth };
}
