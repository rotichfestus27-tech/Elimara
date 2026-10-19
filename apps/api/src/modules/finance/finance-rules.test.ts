import {
  amountToMinorUnits,
  calculateAccountBalance,
  ensureNotExceeding,
  FinanceRuleError,
  formatMinorUnits,
} from "@elimara/database";
import { describe, expect, it } from "vitest";

describe("financial amount rules", () => {
  it("converts and formats decimal amounts without floating-point arithmetic", () => {
    expect(amountToMinorUnits("123456789012.34")).toBe(12_345_678_901_234n);
    expect(formatMinorUnits(-12_345n)).toBe("-123.45");
    expect(amountToMinorUnits("0.00", true)).toBe(0n);
  });

  it.each(["-1.00", "1.001", "01.00", "1000000000000.00", "1e2", ""])(
    "rejects invalid monetary amount %s",
    (value) => {
      expect(() => amountToMinorUnits(value)).toThrow(FinanceRuleError);
    },
  );

  it("requires strictly positive transaction amounts unless zero is explicitly allowed", () => {
    expect(() => amountToMinorUnits("0.00")).toThrow("greater than zero");
    expect(() => amountToMinorUnits("0.01")).not.toThrow();
    expect(() => amountToMinorUnits("0.00", true)).not.toThrow();
  });

  it("derives balances consistently with partial allocations, refunds, reversals, and adjustments", () => {
    expect(
      calculateAccountBalance({
        charges: ["100.00", "50.00"],
        chargeReversals: ["20.00"],
        payments: ["120.00"],
        refunds: ["10.00"],
        debits: ["5.00"],
        credits: ["15.00"],
        allocated: ["70.00"],
        allocationReversals: ["10.00"],
      }),
    ).toEqual({
      totalCharges: "150.00",
      totalChargeReversals: "20.00",
      totalPayments: "120.00",
      totalRefunds: "10.00",
      totalDebits: "5.00",
      totalCredits: "15.00",
      totalAllocated: "70.00",
      totalAllocationReversals: "10.00",
      outstandingCharges: "70.00",
      unappliedCredit: "50.00",
      balanceDue: "10.00",
      netBalance: "10.00",
    });
  });

  it("rejects allocations and refunds that exceed the remaining amount", () => {
    expect(() => ensureNotExceeding("12.50", "12.51", "Payment allocation")).toThrow(
      "exceeds the available amount",
    );
    expect(() => ensureNotExceeding("12.50", "12.50", "Payment allocation")).not.toThrow();
  });
});
