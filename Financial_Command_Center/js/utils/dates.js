export function formatShortDate(date) {
  return date.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
}

export function addMonths(fromDate, months) {
  const target = new Date(fromDate);
  target.setMonth(fromDate.getMonth() + months);
  return target;
}
