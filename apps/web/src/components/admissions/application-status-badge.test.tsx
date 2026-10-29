import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import {
  ApplicationStatusBadge,
  type ApplicationStatus,
} from "./application-status-badge";

afterEach(cleanup);

describe("ApplicationStatusBadge", () => {
  it("presents every supported application status with a readable label", () => {
    const statuses: Array<{ value: ApplicationStatus; label: string }> = [
      { value: "DRAFT", label: "Draft" },
      { value: "SUBMITTED", label: "Submitted" },
      { value: "UNDER_REVIEW", label: "Under review" },
      { value: "ACCEPTED", label: "Accepted" },
      { value: "REJECTED", label: "Rejected" },
      { value: "WITHDRAWN", label: "Withdrawn" },
      { value: "ADMITTED", label: "Admitted" },
    ];

    render(
      <div>
        {statuses.map(({ value }) => (
          <ApplicationStatusBadge key={value} status={value} />
        ))}
      </div>,
    );

    for (const { label } of statuses) {
      expect(screen.getByText(label)).toBeTruthy();
    }
  });
});
