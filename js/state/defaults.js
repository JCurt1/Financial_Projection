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
  employerMatch: 4,
  healthCostMonthly: 150,
  monthlyExpenses: 3200,
  debtApr: 12,
  marketYield: 7.0,
  initialAge: 31,
  targetHorizonAge: 65,
  
  // NEW FEAT: Dual Income Tracking
  spouseWorking: false,
  
  // NEW FEAT: Triple Tax-Advantaged HSA Health Mechanics
  hasHsa: false,
  
  // NEW FEAT: Smart Tax Allocation Engine Selection
  // Acceptable Strategy Keys: 'traditional', 'roth', or 'optimize'
  401kStrategy: 'optimize', 
};
