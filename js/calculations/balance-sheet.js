export function computeBalanceSheet(state) {
  const totalAssets = state.cash + state.retirement + state.homeValue + state.brokerage;
  const totalLiabilities = state.consumerDebt + state.mortgage;
  const netWorth = totalAssets - totalLiabilities;

  return { totalAssets, totalLiabilities, netWorth };
}
