const decimalAmountPattern = /^(-?)(\d+)(?:\.(\d{1,2}))?$/;

export function formatKes(amount: string): string {
  const match = decimalAmountPattern.exec(amount);
  if (!match) return `KES ${amount}`;

  const [, sign, whole, fraction = ""] = match;
  const groupedWhole = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `KES ${sign}${groupedWhole}.${fraction.padEnd(2, "0")}`;
}
