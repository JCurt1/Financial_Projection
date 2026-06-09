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
  spouseIncome: 0,
  hsaCostMonthly: 0,
  hsaBalance: 0,
  
  // Decoupled tax allocation split defaults (Percentages)
  currentTradSplitPercent: 100, // Existing nest egg defaults to 100% Traditional pre-tax
  futureTradSplitPercent: 100,  // Future paychecks default to 100% traditional (pre-tax)

  // State & payroll tax
  stateTaxRate: 0,
  stateCode: 'FL',              // State income tax rate (%), default 0 — user sets their state


  // Retirement tax & investment drag assumptions
  // These are used in projections and Monte Carlo but not yet exposed in the UI.
  // retirementTaxRate: effective tax rate applied to traditional 401k/IRA withdrawals in retirement (%)
  // capitalGainsDrag: fraction of brokerage yield lost to taxes/fees annually (%)
  retirementTaxRate: 15,
  capitalGainsDrag: 10,
  annualSalaryGrowth: 2.0,      // % annual raise applied during accumulation phase
  // Cash drag / investment behavior
  investmentRate: 80,           // % of surplus actually deployed to brokerage (vs sits as cash)
  cashBufferMonths: 3,          // Target cash buffer size in months of expenses before investing
};
