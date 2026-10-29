import { describe, expect, it } from "vitest";
import { formatKes } from "./finance-format";

describe("formatKes", () => {
  it("groups thousands and keeps two decimal places without converting through a number", () => {
    expect(formatKes("12500.5")).toBe("KES 12,500.50");
    expect(formatKes("999999999999.99")).toBe("KES 999,999,999,999.99");
  });

  it("formats whole amounts and preserves unsupported values for visibility", () => {
    expect(formatKes("0")).toBe("KES 0.00");
    expect(formatKes("-2500.00")).toBe("KES -2,500.00");
    expect(formatKes("unknown")).toBe("KES unknown");
  });
});
