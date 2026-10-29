import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppShell } from "./app-shell";
import { SuperadminShell } from "./superadmin-shell";

const authMock = vi.hoisted(() => ({
  logout: vi.fn(),
  school: { id: "school-1", name: "North School", permissions: [] as string[] },
  schools: [] as { id: string; name: string; permissions: string[] }[],
  user: { id: "user-1", email: "admin@example.test" },
  selectSchool: vi.fn(),
}));

vi.mock("@/app/auth-provider", () => ({
  useAuth: () => authMock,
}));

function renderShell(shell: "school" | "platform") {
  const path = shell === "school" ? "/dashboard" : "/superadmin";
  const element = shell === "school" ? <AppShell /> : <SuperadminShell />;

  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route element={element} path={path}>
          <Route index element={<p>Workspace content</p>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

describe("workspace shell sign-out", () => {
  beforeEach(() => {
    authMock.logout.mockReset();
  });

  afterEach(cleanup);

  it.each(["school", "platform"] as const)(
    "prevents duplicate %s sign-out requests and hides backend error details",
    async (shell) => {
      let rejectLogout!: (error: Error) => void;
      authMock.logout.mockReturnValue(
        new Promise<void>((_resolve, reject) => {
          rejectLogout = reject;
        }),
      );
      renderShell(shell);

      const signOut = screen.getAllByRole("button", { name: "Sign Out" })[0];
      fireEvent.click(signOut);
      fireEvent.click(signOut);

      expect(authMock.logout).toHaveBeenCalledTimes(1);
      expect(screen.getByRole("button", { name: "Signing out..." }).hasAttribute("disabled")).toBe(
        true,
      );

      await act(async () => rejectLogout(new Error("Internal server details")));

      expect((await screen.findByRole("alert")).textContent).toBe(
        "Sign out could not be confirmed. Please try again.",
      );
      expect(screen.queryByText("Internal server details")).toBeNull();
      expect(screen.getByText("Workspace content")).toBeTruthy();
    },
  );
});
