import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SuperadminAccessGate } from "@/components/superadmin/superadmin-access-gate";
import { jsonResponse } from "@/test-utils/mock-response";
import { AuthProvider, useAuth } from "./auth-context";
import { ProtectedRoute } from "./protected-route";

const fetchMock = vi.fn<typeof fetch>();

function ProtectedPage() {
  const { logout } = useAuth();
  const [logoutError, setLogoutError] = useState(false);
  return (
    <>
      <p>Protected content</p>
      {logoutError && <p role="alert">Sign-out could not be confirmed.</p>}
      <button
        onClick={async () => {
          try {
            await logout();
          } catch {
            setLogoutError(true);
          }
        }}
        type="button"
      >
        Sign out
      </button>
    </>
  );
}

function renderProtectedRoute() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <MemoryRouter initialEntries={["/protected"]}>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <Routes>
            <Route element={<ProtectedRoute />}>
              <Route path="/protected" element={<ProtectedPage />} />
            </Route>
            <Route path="/login" element={<p>Login page</p>} />
          </Routes>
        </AuthProvider>
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

function renderSuperadminGate() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <MemoryRouter initialEntries={["/superadmin"]}>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <Routes>
            <Route element={<ProtectedRoute />}>
              <Route path="/superadmin" element={<SuperadminAccessGate />}>
                <Route index element={<p>Platform dashboard</p>} />
              </Route>
            </Route>
          </Routes>
        </AuthProvider>
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

describe("ProtectedRoute", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    sessionStorage.removeItem("elimara_school_id");
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("redirects a confirmed unauthenticated user to login", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(401, { error: { code: "UNAUTHENTICATED", message: "Unauthorized" } }),
    );

    renderProtectedRoute();

    expect(await screen.findByText("Login page")).toBeTruthy();
    expect(screen.queryByText("Protected content")).toBeNull();
  });

  it("does not grant access when session verification fails", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("Network unavailable"));

    renderProtectedRoute();

    expect((await screen.findByRole("alert")).textContent).toContain(
      "We couldn't verify your session",
    );
    expect(screen.queryByText("Protected content")).toBeNull();
    expect(screen.queryByText("Login page")).toBeNull();
  });

  it("does not expose protected content while verification is pending", async () => {
    let resolveVerification!: (response: Response) => void;
    fetchMock.mockImplementationOnce(
      () =>
        new Promise<Response>((resolve) => {
          resolveVerification = resolve;
        }),
    );

    renderProtectedRoute();

    expect(screen.getByText("Verifying workspace access...")).toBeTruthy();
    expect(screen.queryByText("Protected content")).toBeNull();

    await act(async () => {
      resolveVerification(
        jsonResponse(401, { error: { code: "UNAUTHENTICATED", message: "Unauthorized" } }),
      );
    });
    expect(await screen.findByText("Login page")).toBeTruthy();
  });

  it("blocks protected content after failed logout without claiming logout succeeded", async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse(200, { data: { user: { id: "u1", email: "u@example.test" } } }),
      )
      .mockResolvedValueOnce(
        jsonResponse(200, { data: [{ id: "school-1", name: "Test School", permissions: [] }] }),
      )
      .mockResolvedValueOnce(
        jsonResponse(500, { error: { code: "SERVER_ERROR", message: "Internal detail" } }),
      );

    renderProtectedRoute();

    expect(await screen.findByText("Protected content")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));

    expect((await screen.findByRole("alert")).textContent).toContain(
      "Sign-out could not be confirmed",
    );
    expect(screen.getByText("Protected content")).toBeTruthy();
    expect(screen.queryByText("Login page")).toBeNull();
    expect(screen.queryByText(/signed out/i)).toBeNull();
    expect(screen.queryByText("Internal detail")).toBeNull();
  });

  it("renders platform content only after the backend verifies platform access", async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse(200, { data: { user: { id: "u1", email: "u@example.test" } } }),
      )
      .mockResolvedValueOnce(jsonResponse(200, { data: [] }))
      .mockResolvedValueOnce(jsonResponse(200, { data: { access: "platform" } }));

    renderSuperadminGate();

    expect(await screen.findByText("Platform dashboard")).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledWith("/api/v1/platform/access", expect.any(Object));
  });

  it("does not render platform content when the backend denies platform access", async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse(200, { data: { user: { id: "u1", email: "u@example.test" } } }),
      )
      .mockResolvedValueOnce(jsonResponse(200, { data: [] }))
      .mockResolvedValueOnce(
        jsonResponse(403, { error: { code: "FORBIDDEN", message: "Forbidden" } }),
      );

    renderSuperadminGate();

    expect(await screen.findByText("Platform access is unavailable")).toBeTruthy();
    expect(screen.queryByText("Platform dashboard")).toBeNull();
  });
});
