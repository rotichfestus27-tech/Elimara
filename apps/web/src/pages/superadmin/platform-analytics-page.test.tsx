import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PlatformAnalyticsPage } from "./platform-analytics-page";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("PlatformAnalyticsPage", () => {
  it("explains unavailable data without fetching or presenting sample values", () => {
    const fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", fetchMock);

    render(<PlatformAnalyticsPage />);

    expect(screen.getByRole("heading", { name: "Platform analytics" })).toBeTruthy();
    expect(screen.getByText("Analytics data unavailable")).toBeTruthy();
    expect(screen.getAllByText("No data loaded")).toHaveLength(5);
    expect(screen.getByRole("figure", { name: "Current schools by status" })).toBeTruthy();
    expect(
      screen.getByRole("figure", { name: "Platform activity over selected period" }),
    ).toBeTruthy();
    expect(screen.getAllByText("No chart data is available.")).toHaveLength(2);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("captures a preview period and validates its date order without querying data", () => {
    const fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", fetchMock);

    render(<PlatformAnalyticsPage />);

    fireEvent.change(screen.getByLabelText("Reporting period start date"), {
      target: { value: "2026-10-10" },
    });
    fireEvent.change(screen.getByLabelText("Reporting period end date"), {
      target: { value: "2026-10-01" },
    });

    expect(screen.getByRole("alert").textContent).toContain(
      "The end date must be on or after the start date.",
    );

    fireEvent.change(screen.getByLabelText("Reporting period end date"), {
      target: { value: "2026-10-20" },
    });

    expect(screen.getByRole("status").textContent).toContain(
      "Selected preview period: 2026-10-10 to 2026-10-20",
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
