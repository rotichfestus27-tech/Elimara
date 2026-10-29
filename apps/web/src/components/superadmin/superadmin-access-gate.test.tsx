import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthProvider } from "@/app/auth-provider";
import { jsonResponse, noContentResponse } from "@/test-utils/mock-response";
import { SuperadminAccessGate } from "./superadmin-access-gate";

const fetchMock = vi.fn<typeof fetch>();

function renderGate() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <MemoryRouter initialEntries={["/superadmin"]}>
      <QueryClientProvider client={client}>
        <AuthProvider>
          <Routes>
            <Route path="/superadmin" element={<SuperadminAccessGate />}>
              <Route index element={<p>Protected platform page</p>} />
            </Route>
          </Routes>
        </AuthProvider>
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("SuperadminAccessGate MFA workflow", () => {
  it("enrolls a factor using the supported API and verifies before rendering protected content", async () => {
    let hasAccess = false;
    fetchMock.mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.endsWith("/auth/me")) {
        return jsonResponse(200, {
          data: { user: { id: "operator-1", email: "operator@example.test" } },
        });
      }
      if (url.endsWith("/auth/schools")) {
        return jsonResponse(200, { data: [] });
      }
      if (url.endsWith("/platform/access")) {
        return hasAccess
          ? jsonResponse(200, { data: { access: "platform" } })
          : jsonResponse(403, {
              error: {
                code: "PLATFORM_MFA_REQUIRED",
                message: "Verify platform MFA.",
              },
            });
      }
      if (url.endsWith("/platform/mfa/status")) {
        return jsonResponse(200, {
          data: { enrolled: hasAccess, sessionVerified: hasAccess },
        });
      }
      if (url.endsWith("/platform/mfa/enrollment")) {
        return jsonResponse(201, {
          data: {
            secret: "TEST-ONLY-ENROLLMENT-SECRET",
            provisioningUri: "otpauth://totp/Elimara:test",
          },
        });
      }
      if (url.endsWith("/platform/mfa/enrollment/confirm")) {
        expect(JSON.parse(String(init?.body))).toEqual({ code: "123456" });
        hasAccess = true;
        return noContentResponse();
      }
      throw new Error(`Unexpected endpoint: ${url}`);
    });

    renderGate();

    expect(await screen.findByText("Set up your authenticator")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Current password"), {
      target: { value: "current-password" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Begin enrollment" }));

    expect(await screen.findByText("TEST-ONLY-ENROLLMENT-SECRET")).toBeTruthy();
    const code = screen.getByLabelText("Six-digit authenticator code");
    fireEvent.change(code, { target: { value: "123456" } });
    fireEvent.click(screen.getByRole("button", { name: "Confirm enrollment" }));

    expect(await screen.findByText("Protected platform page")).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/platform/mfa/enrollment",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ password: "current-password" }),
      }),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/platform/mfa/enrollment/confirm",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ code: "123456" }),
      }),
    );
  });
});
