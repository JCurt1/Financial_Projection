/**
 * Federal income tax bracket calculation for 2024 filing.
 * Returns total annual tax for the given taxable income and filing status.
 */
export function computeFederalTax(taxableIncome, filingStatus) {
  let taxEstimate = 0;

  if (filingStatus === 'single') {
    if (taxableIncome > 11600) taxEstimate += 11600 * 0.10;
    else taxEstimate += taxableIncome * 0.10;
    if (taxableIncome > 47150) taxEstimate += (47150 - 11600) * 0.12;
    else if (taxableIncome > 11600) taxEstimate += (taxableIncome - 11600) * 0.12;
    if (taxableIncome > 100525) taxEstimate += (100525 - 47150) * 0.22;
    else if (taxableIncome > 47150) taxEstimate += (taxableIncome - 47150) * 0.22;
    if (taxableIncome > 100525) taxEstimate += (taxableIncome - 100525) * 0.24;
  } else {
    if (taxableIncome > 23200) taxEstimate += 23200 * 0.10;
    else taxEstimate += taxableIncome * 0.10;
    if (taxableIncome > 94300) taxEstimate += (94300 - 23200) * 0.12;
    else if (taxableIncome > 23200) taxEstimate += (taxableIncome - 23200) * 0.12;
    if (taxableIncome > 201050) taxEstimate += (201050 - 94300) * 0.22;
    else if (taxableIncome > 94300) taxEstimate += (taxableIncome - 94300) * 0.22;
    if (taxableIncome > 201050) taxEstimate += (taxableIncome - 201050) * 0.24;
  }

  return taxEstimate;
}
