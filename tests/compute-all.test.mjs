import { DEFAULT_STATE } from '../js/state/defaults.js';
import { computeAll } from '../js/calculations/index.js';

function assertClose(actual, expected, label) {
  if (Math.abs(actual - expected) > 1) {
    throw new Error(`${label}: expected ~${expected}, got ${actual}`);
  }
}

const result = computeAll(DEFAULT_STATE);

assertClose(result.balanceSheet.netWorth, 18000, 'net worth');
assertClose(result.balanceSheet.totalAssets, 35000, 'total assets');
assertClose(result.balanceSheet.totalLiabilities, 17000, 'total liabilities');
assertClose(result.fi.fiTargetNumber, 960000, 'FI target');
assertClose(result.runway.emergencyMonths, 4500 / 3200, 'emergency months');
assertClose(result.cashflow.savingsMargin, -50, 'savings margin');
if (result.debt.canPayOff !== false) throw new Error('debt: default state should not be payable with negative margin');

console.log('All computeAll smoke tests passed.');
