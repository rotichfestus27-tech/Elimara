import type { AssessmentStatus } from "./assessment-contracts.js";

export type GradeBandInput = {
  code: string;
  label: string;
  lowerPercent: string;
  upperPercent: string;
};

export type NormalizedGradeBand = GradeBandInput & { position: number };

export type CalculatedGrade = {
  score: string;
  maximumScore: string;
  percentage: string;
  gradeCode: string;
  gradeLabel: string;
};

const statusTransitions: Record<AssessmentStatus, readonly AssessmentStatus[]> = {
  DRAFT: ["OPEN"],
  OPEN: ["MODERATION"],
  MODERATION: ["FINALIZED"],
  FINALIZED: ["PUBLISHED", "OPEN"],
  PUBLISHED: ["OPEN"],
};

export function assessmentCanTransition(from: AssessmentStatus, to: AssessmentStatus): boolean {
  return statusTransitions[from]?.includes(to) ?? false;
}

export function assessmentCanEdit(status: AssessmentStatus): boolean {
  return status === "DRAFT";
}

export function assessmentCanEnterMarks(status: AssessmentStatus): boolean {
  return status === "OPEN" || status === "MODERATION";
}

const scorePattern = /^(?:0|[1-9]\d{0,7})(?:\.\d{1,4})?$/;
const percentPattern = /^(?:0|[1-9]\d?)(?:\.\d{1,2})?$|^100(?:\.0{1,2})?$/;
const scoreUnit = 10_000n;

export function normalizeGradeBands(bands: GradeBandInput[]): NormalizedGradeBand[] {
  if (bands.length < 2 || bands.length > 30) {
    throw new AssessmentRuleError("A grading scale must contain between 2 and 30 bands.");
  }
  const normalized = bands.map((band) => ({
    code: band.code.trim().toLocaleUpperCase("en"),
    label: band.label.trim(),
    lowerPercent: canonicalPercent(band.lowerPercent),
    upperPercent: canonicalPercent(band.upperPercent),
  }));
  const codes = new Set<string>();
  for (const band of normalized) {
    if (!/^[A-Z0-9][A-Z0-9_-]{0,23}$/.test(band.code)) {
      throw new AssessmentRuleError("Grade codes must use 1-24 letters, numbers, _ or -.");
    }
    if (!band.label || band.label.length > 100) {
      throw new AssessmentRuleError("Grade labels must contain between 1 and 100 characters.");
    }
    if (codes.has(band.code)) throw new AssessmentRuleError("Grade codes must be unique.");
    codes.add(band.code);
    if (percentUnits(band.lowerPercent) >= percentUnits(band.upperPercent)) {
      throw new AssessmentRuleError("Each lower bound must be less than its upper bound.");
    }
  }
  normalized.sort(
    (left, right) => percentUnits(left.lowerPercent) - percentUnits(right.lowerPercent),
  );
  if (normalized[0]?.lowerPercent !== "0" || normalized.at(-1)?.upperPercent !== "100") {
    throw new AssessmentRuleError("Grade bands must cover the complete 0 through 100 range.");
  }
  for (let index = 1; index < normalized.length; index += 1) {
    if (normalized[index - 1]?.upperPercent !== normalized[index]?.lowerPercent) {
      throw new AssessmentRuleError("Grade bands must be contiguous without overlap or gaps.");
    }
  }
  return normalized.map((band, position) => ({ ...band, position }));
}

export function calculateGrade(
  score: string,
  maximumScore: string,
  bands: GradeBandInput[],
): CalculatedGrade {
  const scoreValue = parseScore(score);
  const maximumValue = parseScore(maximumScore);
  if (maximumValue <= 0n) throw new AssessmentRuleError("Maximum score must be greater than zero.");
  if (scoreValue > maximumValue) {
    throw new AssessmentRuleError("Score cannot exceed the assessment maximum score.");
  }
  const normalizedBands = normalizeGradeBands(bands);
  const band = normalizedBands.find((candidate, index) => {
    const lower = BigInt(percentUnits(candidate.lowerPercent));
    const upper = BigInt(percentUnits(candidate.upperPercent));
    const scaledScore = scoreValue * 10_000n;
    const scaledLower = lower * maximumValue;
    const scaledUpper = upper * maximumValue;
    return (
      scaledScore >= scaledLower &&
      (index === normalizedBands.length - 1
        ? scaledScore <= scaledUpper
        : scaledScore < scaledUpper)
    );
  });
  if (!band) throw new AssessmentRuleError("The score does not match a configured grading band.");
  const percentageUnits = (scoreValue * 1_000_000n + maximumValue / 2n) / maximumValue;
  return {
    score: formatScore(scoreValue),
    maximumScore: formatScore(maximumValue),
    percentage: formatPercentage(percentageUnits),
    gradeCode: band.code,
    gradeLabel: band.label,
  };
}

export class AssessmentRuleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AssessmentRuleError";
  }
}

function parseScore(value: string): bigint {
  if (!scorePattern.test(value)) {
    throw new AssessmentRuleError("Scores must be non-negative decimals with at most four places.");
  }
  const [whole = "0", fraction = ""] = value.split(".");
  return BigInt(whole) * scoreUnit + BigInt(fraction.padEnd(4, "0"));
}

function canonicalPercent(value: string): string {
  if (!percentPattern.test(value)) {
    throw new AssessmentRuleError(
      "Grading bounds must be percentages from 0 to 100 with at most two places.",
    );
  }
  const [whole = "0", fraction = ""] = value.split(".");
  const normalized = `${whole}.${fraction.padEnd(2, "0")}`;
  return normalized.replace(/\.?0+$/, "") || "0";
}

function percentUnits(value: string): number {
  const [whole = "0", fraction = ""] = value.split(".");
  return Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
}

function formatScore(value: bigint): string {
  return `${value / scoreUnit}.${(value % scoreUnit).toString().padStart(4, "0")}`;
}

function formatPercentage(value: bigint): string {
  return `${value / 10_000n}.${(value % 10_000n).toString().padStart(4, "0")}`;
}
