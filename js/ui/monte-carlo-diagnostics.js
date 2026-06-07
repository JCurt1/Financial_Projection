export function renderMonteCarloDiagnostics(result) {
  const mc = result.monteCarlo;
  if (!mc) return;

  // 1. Sync calculations cleanly to the HTML text slots
  const lblProbability = document.getElementById('lbl-mc-probability');
  const lblP10 = document.getElementById('lbl-mc-p10');
  const lblP50 = document.getElementById('lbl-mc-p50');
  const lblP90 = document.getElementById('lbl-mc-p90');

  if (lblProbability) lblProbability.textContent = mc.probabilityOfSuccess;
  if (lblP10) lblP10.textContent = '$' + Math.round(mc.p10Baseline).toLocaleString();
  if (lblP50) lblP50.textContent = '$' + Math.round(mc.p50Baseline).toLocaleString();
  if (lblP90) lblP90.textContent = '$' + Math.round(mc.p90Baseline).toLocaleString();

  // 2. Dynamic status badging color-coding rules
  const badgeElement = document.getElementById('mc-success-badge');
  if (badgeElement) {
    if (mc.probabilityOfSuccess >= 85) {
      badgeElement.style.background = 'rgba(0, 204, 102, 0.15)';
      badgeElement.style.color = '#00cc66';
    } else if (mc.probabilityOfSuccess >= 60) {
      badgeElement.style.background = 'rgba(255, 153, 51, 0.15)';
      badgeElement.style.color = '#ff9933';
    } else {
      badgeElement.style.background = 'rgba(255, 77, 77, 0.15)';
      badgeElement.style.color = '#ff4d4d';
    }
  }
}
