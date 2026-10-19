const amountPattern = /^(?:0|[1-9]\d{0,11})(?:\.\d{1,2})?$/;

export class FinanceRuleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FinanceRuleError";
  }
}

export function amountToMinorUnits(value: string, allowZero = false): bigint {
  if (!amountPattern.test(value)) {
    throw new FinanceRuleError("Amounts must be non-negative KES decimals with at most two places.");
  }
  const [whole = "0", fraction = ""] = value.split(".");
  const minor = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"));
  if (!allowZero && minor <= 0n) throw new FinanceRuleError("Amounts must be greater than zero.");
  return minor;
}

export function formatMinorUnits(amount: bigint): string {
  const absolute = amount < 0n ? -amount : amount;
  const formatted = `${absolute / 100n}.${(absolute % 100n).toString().padStart(2, "0")}`;
  return amount < 0n ? `-${formatted}` : formatted;
}

export function calculateAccountBalance(input: {
  charges: string[];
  chargeReversals: string[];
  payments: string[];
  refunds: string[];
  debits: string[];
  credits: string[];
  allocated: string[];
  allocationReversals: string[];
}) {
  const sum = (values: string[]) => values.reduce((total, value) => total + amountToMinorUnits(value, true), 0n);
  const chargeTotal = sum(input.charges);
  const chargeReversalTotal = sum(input.chargeReversals);
  const paymentTotal = sum(input.payments);
  const refundTotal = sum(input.refunds);
  const debitTotal = sum(input.debits);
  const creditTotal = sum(input.credits);
  const allocatedTotal = sum(input.allocated);
  const allocationReversalTotal = sum(input.allocationReversals);
  const outstanding = chargeTotal - chargeReversalTotal - allocatedTotal + allocationReversalTotal;
  const net = chargeTotal - chargeReversalTotal + debitTotal - creditTotal - paymentTotal + refundTotal;
  const unapplied = paymentTotal - refundTotal - allocatedTotal + allocationReversalTotal;
  return {
    totalCharges: formatMinorUnits(chargeTotal),
    totalChargeReversals: formatMinorUnits(chargeReversalTotal),
    totalPayments: formatMinorUnits(paymentTotal),
    totalRefunds: formatMinorUnits(refundTotal),
    totalDebits: formatMinorUnits(debitTotal),
    totalCredits: formatMinorUnits(creditTotal),
    totalAllocated: formatMinorUnits(allocatedTotal),
    totalAllocationReversals: formatMinorUnits(allocationReversalTotal),
    outstandingCharges: formatMinorUnits(outstanding),
    unappliedCredit: formatMinorUnits(unapplied),
    balanceDue: formatMinorUnits(net > 0n ? net : 0n),
    netBalance: formatMinorUnits(net),
  };
}

export function ensureNotExceeding(available: string, requested: string, label: string): void {
  if (amountToMinorUnits(requested) > amountToMinorUnits(available, true)) {
    throw new FinanceRuleError(`${label} exceeds the available amount.`);
  }
}
