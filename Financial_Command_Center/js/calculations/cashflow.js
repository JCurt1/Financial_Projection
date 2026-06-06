export function computeCashflow(state, taxResult) {
  const savingsMargin = taxResult.baseTakehome - state.monthlyExpenses;
  return { savingsMargin };
}
