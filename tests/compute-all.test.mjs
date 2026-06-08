import { DEFAULT_STATE } from '../js/state/defaults.js';
import { computeAll } from '../js/calculations/index.js';

function assertClose(actual, expected, label, tolerance = 1) {
  if (Math.abs(actual - expected) > tolerance) {
    throw new Error(`${label}: expected ~${expected}, got ${actual}`);
  }
}

const result = computeAll(DEFAULT_STATE);

// Balance sheet — structural, should always be stable
assertClose(result.balanceSheet.netWorth, 18000, 'net worth');
assertClose(result.balanceSheet.totalAssets, 35000, 'total assets');
assertClose(result.balanceSheet.totalLiabilities, 17000, 'total liabilities');

// FI target: $3200/mo * 12 * 25 = $960,000
assertClose(result.fi.fiTargetNumber, 960000, 'FI target');

// Emergency runway: $4500 cash / $3200/mo = 1.40625 months
assertClose(result.runway.emergencyMonths, 4500 / 3200, 'emergency months');

// Savings margin: take-home minus expenses.
// Default: FL (0% state tax), single, $50k gross, 15% 401k deferral (50/50 trad/roth split),
// $150/mo health. Federal + FICA taxes computed from 2026 brackets.
// Expected: ~-390 (deficit — confirmed by live calculation)
assertClose(result.cashflow.savingsMargin, -390, 'savings margin', 2);

// With negative margin, debt cannot be paid off
if (result.debt.canPayOff !== false) throw new Error('debt: default state should not be payable with negative margin');

console.log('All computeAll smoke tests passed.');
