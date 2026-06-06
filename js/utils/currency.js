export function formatCurrency(val) {
  if (val < 0) return '-' + formatCurrency(Math.abs(val));
  return '$' + Math.floor(val).toLocaleString('en-US');
}

export function parseInputVal(str) {
  const clean = String(str).replace(/[^0-9.-]/g, '');
  const parsed = parseFloat(clean);
  return isNaN(parsed) ? 0 : parsed;
}
