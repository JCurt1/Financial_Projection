export function renderTimeline({ debt, runway, fi, simulation }) {
  const debtNode = document.getElementById('node-debt');
  debtNode.className = debt.nodeClassName;
  document.getElementById('status-debt').textContent = debt.statusLabel;
  document.getElementById('date-debt').textContent = debt.dateLabel;

  const runwayNode = document.getElementById('node-runway');
  runwayNode.className = runway.nodeClassName;
  document.getElementById('status-runway').textContent = runway.statusLabel;
  document.getElementById('date-runway').textContent = runway.dateLabel;

  const coastNode = document.getElementById('node-coast');
  const coastStatus = document.getElementById('status-coast');
  const coastDateText = document.getElementById('date-coast');

  if (fi.liquidPortfolioPool >= fi.coastThreshold) {
    coastNode.className = 'timeline-node phase-coast complete';
    coastStatus.textContent = 'Achieved';
    coastDateText.textContent = 'Immediate';
  } else if (simulation.absoluteCoastAchievedAge) {
    coastNode.className = 'timeline-node phase-coast active';
    coastStatus.textContent = 'Approaching';
    coastDateText.textContent = 'Age ' + simulation.absoluteCoastAchievedAge;
  } else {
    coastNode.className = 'timeline-node phase-coast';
    coastStatus.textContent = 'Locked';
    coastDateText.textContent = '—';
  }

  const fiNode = document.getElementById('node-fi');
  const fiStatus = document.getElementById('status-fi');
  const fiDateText = document.getElementById('date-fi');

  if (fi.liquidPortfolioPool >= fi.fiTargetNumber) {
    fiNode.className = 'timeline-node phase-fi complete';
    fiStatus.textContent = 'Achieved';
    fiDateText.textContent = 'Immediate';
  } else if (simulation.absoluteFiAchievedAge) {
    fiNode.className = 'timeline-node phase-fi active';
    fiStatus.textContent = 'Tracking';
    fiDateText.textContent = 'Age ' + simulation.absoluteFiAchievedAge;
  } else {
    fiNode.className = 'timeline-node phase-fi';
    fiStatus.textContent = 'Locked';
    fiDateText.textContent = '—';
  }
}
