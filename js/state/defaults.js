export const DEFAULT_STATE = {
  cash: 4500,
  retirement: 22000,
  homeValue: 0,
  brokerage: 8500,
  consumerDebt: 17000,
  mortgage: 0,
  grossIncome: 50000,
  filingStatus: 'single',
  deferral401k: 15,
  employerMatchRate: 100,       // % of contributions matched (e.g. 100 = dollar-for-dollar)
  employerMatchCeiling: 4,      // Max % of salary eligible for match (e.g. 4 = up to 4% of gross)
  healthCostMonthly: 150,
  monthlyExpenses: 3200,
  debtApr: 12,
  marketYield: 7.0,
  initialAge: 31,
  targetHorizonAge: 65,
  spouseWorking: false,
  hsaCostMonthly: 0, // Swapped from boolean to a clean starting dollar tracker
  
  // Decoupled tax allocation split defaults (Percentages)
  currentTradSplitPercent: 100, // Existing nest egg defaults to 100% Traditional pre-tax
  futureTradSplitPercent: 50,   // Future paychecks default to a balanced 50/50 split

  // State & payroll tax
  stateTaxRate: 0,              // State income tax rate (%), default 0 — user sets their state

  // Cash drag / investment behavior
  investmentRate: 80,           // % of surplus actually deployed to brokerage (vs sits as cash)
  cashBufferMonths: 3,          // Target cash buffer size in months of expenses before investing
};
