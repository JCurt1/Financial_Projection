import { STANDARD_DEDUCTION } from '../config/constants.js';

// Official 2026 Marginal Tax Brackets
const TAX_BRACKETS_2026 = {
  single: [
    { min: 0, max: 12400, rate: 0.10 },
    { min: 12400, max: 50400, rate: 0.12 },
    { min: 50400, max: 105700, rate: 0.22 },
    { min: 105700, max: 201775, rate: 0.24 },
    { min: 201775, max: 256225, rate: 0.32 },
    { min: 256225, max: 640600, rate: 0.35 },
    { min: 640600, max: Infinity, rate: 0.37 }
  ],
  married: [
    { min: 0, max: 24800, rate: 0.10 },
    { min: 24800, max: 100800, rate: 0.12 },
    { min: 100800, max: 211400, rate: 0.22 },
    { min: 211400, max: 403550, rate: 0.24 },
    { min: 403550, max: 512450, rate: 0.32 },
    { min: 512450, max: 768700, rate: 0.35 },
    { min: 768700, max: Infinity, rate: 0.37 }
  ]
};

/**
 * Federal income tax bracket calculation for progressive tax filing.
 * Returns total annual tax for the given taxable income and filing status.
 */
export function computeFederalTax(taxableIncome, filingStatus) {
  // Ensure we have a valid status, defaulting to single safety fallback
  const status = TAX_BRACKETS_2026[filingStatus] ? filingStatus : 'single';
  const brackets = TAX_BRACKETS_2026[status];
  
  let totalTax = 0;
  let remainingIncome = Math.max(taxableIncome, 0);

  // If there's no taxable income left after deductions, tax is zero
  if (remainingIncome <= 0) return 0;

  // Loop progressively through each marginal tier layer
  for (const bracket of brackets) {
    if (taxableIncome > bracket.min) {
      // Calculate how much income fits completely inside this specific bracket width
      const bracketWidth = bracket.max - bracket.min;
      const incomeInThisBracket = Math.min(taxableIncome - bracket.min, bracketWidth);
      
      totalTax += incomeInThisBracket * bracket.rate;
    } else {
      // Since brackets are sorted low-to-high, we can break early if we hit an empty tier
      break;
    }
  }

  return totalTax;
}
