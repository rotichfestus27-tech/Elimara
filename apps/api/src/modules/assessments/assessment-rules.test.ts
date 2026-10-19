import { describe, expect, it } from "vitest";
import {
  AssessmentRuleError,
  assessmentCanEdit,
  assessmentCanEnterMarks,
  assessmentCanTransition,
  calculateGrade,
  normalizeGradeBands,
} from "@elimara/database";

const bands = [
  { code: "A", label: "Excellent", lowerPercent: "80", upperPercent: "100" },
  { code: "B", label: "Satisfactory", lowerPercent: "0", upperPercent: "80" },
];

describe("assessment grading rules", () => {
  it("locks finalized results until the audited correction workflow reopens them", () => {
    expect(assessmentCanEdit("FINALIZED")).toBe(false);
    expect(assessmentCanEdit("PUBLISHED")).toBe(false);
    expect(assessmentCanEnterMarks("FINALIZED")).toBe(false);
    expect(assessmentCanEnterMarks("PUBLISHED")).toBe(false);
    expect(assessmentCanTransition("OPEN", "PUBLISHED")).toBe(false);
    expect(assessmentCanTransition("FINALIZED", "OPEN")).toBe(true);
    expect(assessmentCanTransition("PUBLISHED", "OPEN")).toBe(true);
  });

  it("normalizes complete contiguous bands and applies exact lower-inclusive boundaries", () => {
    expect(normalizeGradeBands(bands).map(({ code, position }) => [code, position])).toEqual([
      ["B", 0],
      ["A", 1],
    ]);
    expect(calculateGrade("79.9999", "100", bands).gradeCode).toBe("B");
    expect(calculateGrade("80", "100", bands).gradeCode).toBe("A");
    expect(calculateGrade("100", "100", bands).gradeCode).toBe("A");
  });

  it("uses exact decimals and deterministically rounds the displayed percentage to four places", () => {
    const result = calculateGrade("1", "3", [
      { code: "A", label: "A", lowerPercent: "33.34", upperPercent: "100" },
      { code: "B", label: "B", lowerPercent: "0", upperPercent: "33.34" },
    ]);
    expect(result.percentage).toBe("33.3333");
    expect(result.gradeCode).toBe("B");
    expect(calculateGrade("12.3456", "20", bands).percentage).toBe("61.7280");
  });

  it.each([
    [
      "gap",
      [
        { code: "A", label: "A", lowerPercent: "0", upperPercent: "49" },
        { code: "B", label: "B", lowerPercent: "50", upperPercent: "100" },
      ],
    ],
    [
      "overlap",
      [
        { code: "A", label: "A", lowerPercent: "0", upperPercent: "60" },
        { code: "B", label: "B", lowerPercent: "59", upperPercent: "100" },
      ],
    ],
    [
      "missing upper coverage",
      [
        { code: "A", label: "A", lowerPercent: "0", upperPercent: "99" },
        { code: "B", label: "B", lowerPercent: "99", upperPercent: "99.99" },
      ],
    ],
  ])("rejects a grading scale with a %s", (_name, invalidBands) => {
    expect(() => normalizeGradeBands(invalidBands)).toThrow(AssessmentRuleError);
  });

  it("rejects duplicate grade codes, malformed bounds, zero maximum, and scores outside range", () => {
    expect(() =>
      normalizeGradeBands([
        { code: "A", label: "A", lowerPercent: "0", upperPercent: "50" },
        { code: "a", label: "Again", lowerPercent: "50", upperPercent: "100" },
      ]),
    ).toThrow("Grade codes must be unique");
    expect(() => calculateGrade("0", "0", bands)).toThrow(
      "Maximum score must be greater than zero",
    );
    expect(() => calculateGrade("10.0001", "10", bands)).toThrow("Score cannot exceed");
    expect(() => calculateGrade("-1", "10", bands)).toThrow("non-negative decimals");
  });
});
