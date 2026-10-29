import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthProvider } from "@/app/auth-provider";
import { jsonResponse, noContentResponse } from "@/test-utils/mock-response";
import { AppRouter } from "./router";

const { dashboardModuleLoad } = vi.hoisted(() => ({
  dashboardModuleLoad: { wait: null as (() => Promise<void>) | null },
}));

vi.mock("@/pages/dashboard-page", async () => {
  await dashboardModuleLoad.wait?.();
  return { DashboardPage: () => <p>School dashboard content</p> };
});

vi.mock("@/pages/finance-page", () => ({
  FinancePage: () => <p>Finance route content</p>,
}));

vi.mock("@/pages/students-page", () => ({
  StudentsPage: () => <p>School administration student records</p>,
}));

const fetchMock = vi.fn<typeof fetch>();

function CurrentPath() {
  const { pathname } = useLocation();
  return <p>Current route: {pathname}</p>;
}

function renderAppRouter(path: string, showCurrentPath = false) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <MemoryRouter initialEntries={[path]}>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          {showCurrentPath && <CurrentPath />}
          <AppRouter />
        </AuthProvider>
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

function mockIdentity(schools: unknown[]) {
  fetchMock.mockImplementation(async (input) => {
    const url = String(input);
    if (url.endsWith("/auth/me")) {
      return jsonResponse(200, {
        data: { user: { id: "user-1", email: "user@example.test" } },
      });
    }
    if (url.endsWith("/auth/schools")) {
      return jsonResponse(200, { data: schools });
    }
    return jsonResponse(404, { error: { code: "NOT_FOUND", message: "Not found" } });
  });
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

beforeEach(() => {
  fetchMock.mockReset();
  sessionStorage.removeItem("elimara_school_id");
  sessionStorage.removeItem("elimara_session_active");
  vi.stubGlobal("fetch", fetchMock);
});

describe("AppRouter dashboard entry", () => {
  it("announces the route fallback while a page module is loading", async () => {
    let resolveModule!: () => void;
    const moduleGate = new Promise<void>((resolve) => {
      resolveModule = resolve;
    });
    dashboardModuleLoad.wait = () => moduleGate;
    mockIdentity([{ id: "school-1", name: "Authorized School", permissions: [] }]);

    renderAppRouter("/dashboard");

    expect(await screen.findByRole("status")).toHaveProperty("textContent", "Loading page...");
    resolveModule();
    expect(await screen.findByText("School dashboard content")).toBeTruthy();
    dashboardModuleLoad.wait = null;
  });

  it("returns a previously authenticated user to sign in when session restoration confirms expiry", async () => {
    sessionStorage.setItem("elimara_session_active", "true");
    fetchMock.mockResolvedValueOnce(
      jsonResponse(401, {
        error: { code: "UNAUTHENTICATED", message: "Unauthorized" },
      }),
    );

    renderAppRouter("/dashboard", true);

    expect(await screen.findByText("Sign in to Elimara")).toBeTruthy();
    expect(await screen.findByText("Current route: /login")).toBeTruthy();
    expect((await screen.findByRole("alert")).textContent).toContain(
      "Your session has expired. Sign in again.",
    );
    expect(screen.queryByText("School dashboard content")).toBeNull();
  });

  it("keeps the sign-in form visible with a pending state until login completes", async () => {
    let resolveLogin!: (response: Response) => void;
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse(401, {
          error: { code: "UNAUTHENTICATED", message: "Unauthorized" },
        }),
      )
      .mockImplementationOnce(
        () =>
          new Promise<Response>((resolve) => {
            resolveLogin = resolve;
          }),
      )
      .mockResolvedValueOnce(
        jsonResponse(200, {
          data: { user: { id: "user-1", email: "user@example.test" } },
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse(200, {
          data: [{ id: "school-1", name: "Authorized School", permissions: [] }],
        }),
      );

    renderAppRouter("/login");

    fireEvent.change(await screen.findByRole("textbox", { name: "Email" }), {
      target: { value: "user@example.test" },
    });
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "correct-password" },
    });
    const signInForm = screen.getByRole("button", { name: "Sign in" }).closest("form");
    if (!signInForm) throw new Error("The sign-in form was not rendered.");
    fireEvent.submit(signInForm);

    expect(await screen.findByRole("button", { name: "Signing in..." })).toBeTruthy();
    expect(screen.queryByText("Checking your session...")).toBeNull();

    resolveLogin(noContentResponse());
    expect(await screen.findByText("School dashboard content")).toBeTruthy();
  });

  it("routes the platform alias through the server-verified access gate without requiring school membership", async () => {
    fetchMock.mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith("/auth/me")) {
        return jsonResponse(200, {
          data: { user: { id: "user-1", email: "user@example.test" } },
        });
      }
      if (url.endsWith("/auth/schools")) {
        return jsonResponse(200, { data: [] });
      }
      if (url.endsWith("/platform/access")) {
        return jsonResponse(403, {
          error: { code: "FORBIDDEN", message: "Forbidden" },
        });
      }
      return jsonResponse(404, { error: { code: "NOT_FOUND", message: "Not found" } });
    });

    renderAppRouter("/platform");

    expect(await screen.findByText("Platform access is unavailable")).toBeTruthy();
    expect(screen.queryByText("No active school access")).toBeNull();
    expect(fetchMock).toHaveBeenCalledWith("/api/v1/platform/access", expect.any(Object));
  });

  it("opens a school detail route inside the existing platform access gate", async () => {
    fetchMock.mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith("/auth/me")) {
        return jsonResponse(200, {
          data: { user: { id: "user-1", email: "user@example.test" } },
        });
      }
      if (url.endsWith("/auth/schools")) return jsonResponse(200, { data: [] });
      if (url.endsWith("/platform/access")) {
        return jsonResponse(200, { data: { access: "platform" } });
      }
      if (url.endsWith("/platform/schools/school-1")) {
        return jsonResponse(200, {
          data: {
            id: "school-1",
            name: "North School",
            contactEmail: "office@example.test",
            contactPhone: null,
            status: "ACTIVE",
            createdAt: "2026-10-20T00:00:00.000Z",
            updatedAt: "2026-10-20T00:00:00.000Z",
          },
        });
      }
      return jsonResponse(404, { error: { code: "NOT_FOUND", message: "Not found" } });
    });

    renderAppRouter("/superadmin/schools/school-1");

    expect(await screen.findByRole("heading", { name: "North School" })).toBeTruthy();
    expect(screen.getByRole("navigation", { name: "School detail sections" })).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledWith("/api/v1/platform/access", expect.any(Object));
    expect(fetchMock).toHaveBeenCalledWith("/api/v1/platform/schools/school-1", expect.any(Object));
  });

  it("keeps unknown platform paths inside the platform control plane", async () => {
    fetchMock.mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith("/auth/me")) {
        return jsonResponse(200, {
          data: { user: { id: "user-1", email: "user@example.test" } },
        });
      }
      if (url.endsWith("/auth/schools")) return jsonResponse(200, { data: [] });
      if (url.endsWith("/platform/access")) {
        return jsonResponse(200, { data: { access: "platform" } });
      }
      return jsonResponse(404, { error: { code: "NOT_FOUND", message: "Not found" } });
    });

    renderAppRouter("/superadmin/unknown", true);

    expect(await screen.findByText("Current route: /superadmin")).toBeTruthy();
    expect(screen.getByRole("navigation", { name: "Platform navigation" })).toBeTruthy();
    expect(screen.queryByRole("navigation", { name: "Main navigation" })).toBeNull();
  });

  it("opens the analytics preview inside the existing platform access gate without requesting analytics data", async () => {
    fetchMock.mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith("/auth/me")) {
        return jsonResponse(200, {
          data: { user: { id: "user-1", email: "user@example.test" } },
        });
      }
      if (url.endsWith("/auth/schools")) return jsonResponse(200, { data: [] });
      if (url.endsWith("/platform/access")) {
        return jsonResponse(200, { data: { access: "platform" } });
      }
      throw new Error(`Unexpected endpoint: ${url}`);
    });

    renderAppRouter("/superadmin/analytics");

    expect(await screen.findByRole("heading", { name: "Platform analytics" })).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledWith("/api/v1/platform/access", expect.any(Object));
    expect(
      fetchMock.mock.calls.every(([input]) => !String(input).includes("/platform/analytics")),
    ).toBe(true);
  });

  it("keeps platform settings behind the server-verified platform access gate", async () => {
    fetchMock.mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith("/auth/me")) {
        return jsonResponse(200, {
          data: { user: { id: "user-1", email: "user@example.test" } },
        });
      }
      if (url.endsWith("/auth/schools")) return jsonResponse(200, { data: [] });
      if (url.endsWith("/platform/access")) {
        return jsonResponse(403, {
          error: { code: "FORBIDDEN", message: "Forbidden" },
        });
      }
      return jsonResponse(404, { error: { code: "NOT_FOUND", message: "Not found" } });
    });

    renderAppRouter("/superadmin/settings");

    expect(await screen.findByText("Platform access is unavailable")).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Platform settings" })).toBeNull();
    expect(fetchMock).toHaveBeenCalledWith("/api/v1/platform/access", expect.any(Object));
  });

  it.each(["/teacher", "/school/teacher"])(
    "does not infer an unsupported school dashboard from %s",
    async (path) => {
      mockIdentity([{ id: "school-1", name: "Authorized School", permissions: [] }]);

      renderAppRouter(path);

      expect(await screen.findByText("School dashboard content")).toBeTruthy();
      expect(screen.queryByText("Teacher dashboard")).toBeNull();
    },
  );

  it("does not route to the internal Parent Dashboard from an unsupported parent path", async () => {
    mockIdentity([{ id: "school-1", name: "Authorized School", permissions: [] }]);

    renderAppRouter("/parent");

    expect(await screen.findByText("School dashboard content")).toBeTruthy();
    expect(screen.queryByText("Parent / Guardian")).toBeNull();
    expect(screen.queryByText("Child profiles and academic overview")).toBeNull();
  });

  it.each(["/student", "/students/dashboard"])(
    "does not route to the internal Student Dashboard from %s",
    async (path) => {
      mockIdentity([{ id: "school-1", name: "Authorized School", permissions: [] }]);

      renderAppRouter(path);

      expect(await screen.findByText("School dashboard content")).toBeTruthy();
      expect(screen.queryByText("Student dashboard")).toBeNull();
    },
  );

  it("opens the Library workspace within the selected authorized school context", async () => {
    mockIdentity([
      {
        id: "school-1",
        name: "Authorized School",
        permissions: ["library.catalog.read"],
      },
    ]);
    fetchMock.mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith("/auth/me")) {
        return jsonResponse(200, {
          data: { user: { id: "user-1", email: "user@example.test" } },
        });
      }
      if (url.endsWith("/auth/schools")) {
        return jsonResponse(200, {
          data: [
            {
              id: "school-1",
              name: "Authorized School",
              permissions: ["library.catalog.read"],
            },
          ],
        });
      }
      if (url.includes("/schools/school-1/library/catalog/items?")) {
        return jsonResponse(200, {
          data: [],
          meta: { limit: 25, offset: 0, total: 0 },
        });
      }
      return jsonResponse(404, { error: { code: "NOT_FOUND", message: "Not found" } });
    });

    renderAppRouter("/library");

    expect(await screen.findByRole("heading", { name: "Library overview" })).toBeTruthy();
    expect(await screen.findByText("Catalog is empty")).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringMatching(/\/api\/v1\/schools\/school-1\/library\/catalog\/items\?/),
      expect.any(Object),
    );
  });

  it("registers and exposes the Finance route for a server-granted refund capability", async () => {
    mockIdentity([
      {
        id: "school-1",
        name: "Authorized School",
        permissions: ["finance.refunds.manage"],
      },
    ]);

    renderAppRouter("/finance");

    expect(await screen.findByText("Finance route content")).toBeTruthy();
    expect(screen.getAllByRole("link", { name: "Finance" }).length).toBeGreaterThan(0);
  });

  it("routes the Students navigation link to school records, not the internal Student Dashboard", async () => {
    mockIdentity([
      {
        id: "school-1",
        name: "Authorized School",
        permissions: ["students.profile.read"],
      },
    ]);

    renderAppRouter("/dashboard", true);

    const studentsLink = await screen.findByRole("link", { name: "Students" });
    expect(studentsLink.getAttribute("href")).toBe("/students");
    fireEvent.click(studentsLink);

    expect(await screen.findByText("School administration student records")).toBeTruthy();
    expect(await screen.findByText("Current route: /students")).toBeTruthy();
    expect(screen.queryByText("Student dashboard")).toBeNull();
  });
});
