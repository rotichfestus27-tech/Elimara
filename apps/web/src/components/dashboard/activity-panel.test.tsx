import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ActivityPanel } from "./activity-panel";

afterEach(cleanup);

describe("ActivityPanel", () => {
  it("clearly identifies the activity and alert feed as unavailable without sample data", () => {
    render(<ActivityPanel />);

    expect(screen.getByRole("heading", { name: "Activity and alerts" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Feed unavailable" })).toBeTruthy();
    expect(
      screen.getByText(
        "No approved school-wide activity or alert feed is connected.",
      ),
    ).toBeTruthy();
    expect(
      screen.getByText(
        "No activity events or alerts are shown until an approved source is available. No sample data is being shown.",
      ),
    ).toBeTruthy();
  });
});
