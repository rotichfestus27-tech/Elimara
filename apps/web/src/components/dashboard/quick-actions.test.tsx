import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router";
import { QuickActions } from "./quick-actions";

const { useAuthMock } = vi.hoisted(() => ({
  useAuthMock: vi.fn(),
}));

vi.mock("@/app/auth-provider", () => ({
  useAuth: useAuthMock,
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("QuickActions", () => {
  it("uses the Finance route's label and hides shortcuts without server permission", () => {
    useAuthMock.mockReturnValue({
      school: { permissions: ["finance.payments.read"] },
    });

    render(
      <MemoryRouter>
        <QuickActions />
      </MemoryRouter>,
    );

    const financeLink = screen.getByRole("link", {
      name: /Finance\s*Open the school finance workspace/,
    });
    expect(financeLink.getAttribute("href")).toBe("/finance");
    expect(screen.queryByRole("link", { name: /Fee collection/ })).toBeNull();
    expect(screen.queryByRole("link", { name: /^Students/ })).toBeNull();
  });

  it("shows an unavailable state instead of shortcuts when no module permission is granted", () => {
    useAuthMock.mockReturnValue({ school: { permissions: [] } });

    render(
      <MemoryRouter>
        <QuickActions />
      </MemoryRouter>,
    );

    expect(
      screen.getByText("No workspace shortcuts are available for the current permissions."),
    ).toBeTruthy();
    expect(screen.queryByRole("link")).toBeNull();
  });
});
