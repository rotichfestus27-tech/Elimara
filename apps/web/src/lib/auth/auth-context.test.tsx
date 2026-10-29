import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SESSION_EXPIRED_EVENT } from "@/lib/api/client";
import { jsonResponse, noContentResponse } from "@/test-utils/mock-response";
import { AuthProvider, useAuth } from "./auth-context";

const user = {
  id: "user-1",
  email: "admin@example.test",
};

const schools = [
  { id: "school-1", name: "North School", permissions: [] },
  { id: "school-2", name: "South School", permissions: [] },
];

const fetchMock = vi.fn<typeof fetch>();

function AuthProbe() {
  const {
    user: currentUser,
    schools: currentSchools,
    school,
    loading,
    error,
    login,
    logout,
    refreshAuth,
    selectSchool,
    updateSchoolName,
  } = useAuth();
  const [logoutFailed, setLogoutFailed] = useState(false);

  return (
    <div>
      <span>{loading ? "loading" : currentUser ? "authenticated" : "unauthenticated"}</span>
      <span>{currentUser?.email ?? "no user"}</span>
      <span>{school?.id ?? "no school"}</span>
      <span>{currentSchools.length}</span>
      <span>{currentSchools.map((item) => item.name).join(", ")}</span>
      {error && <p role="alert">{error}</p>}
      {logoutFailed && (
        <p role="alert">
          Sign-out could not be confirmed. Retry session verification before continuing.
        </p>
      )}
      <button onClick={() => void logout().catch(() => setLogoutFailed(true))} type="button">
        Sign out
      </button>
      <button
        onClick={() => void login("admin@example.test", "correct-horse-battery-staple")}
        type="button"
      >
        Sign in
      </button>
      <button onClick={() => void refreshAuth()} type="button">
        Retry verification
      </button>
      <button onClick={() => selectSchool("school-2")} type="button">
        Select another school
      </button>
      <button onClick={() => updateSchoolName("school-1", "Renamed School")} type="button">
        Rename school
      </button>
    </div>
  );
}

function createQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
}

function renderAuth(queryClient = createQueryClient(), child = <AuthProbe />) {
  return render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>{child}</AuthProvider>
    </QueryClientProvider>,
  );
}

function queueAuthenticatedResponses() {
  fetchMock
    .mockResolvedValueOnce(jsonResponse(200, { data: { user } }))
    .mockResolvedValueOnce(jsonResponse(200, { data: schools }));
}

describe("AuthProvider", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    sessionStorage.removeItem("elimara_school_id");
    sessionStorage.removeItem("elimara_session_active");
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("treats a confirmed 401 as unauthenticated", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(401, { error: { code: "UNAUTHENTICATED", message: "Unauthorized" } }),
    );

    renderAuth();

    expect(await screen.findByText("unauthenticated")).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("updates the school name locally after a successful profile save", async () => {
    queueAuthenticatedResponses();

    renderAuth();
    expect(await screen.findByText("North School, South School")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Rename school" }));

    expect(await screen.findByText("Renamed School, South School")).toBeTruthy();
  });

  it("identifies a previously established session that expired before restoration", async () => {
    sessionStorage.setItem("elimara_session_active", "true");
    fetchMock.mockResolvedValueOnce(
      jsonResponse(401, { error: { code: "UNAUTHENTICATED", message: "Unauthorized" } }),
    );

    renderAuth();

    expect((await screen.findByRole("alert")).textContent).toContain(
      "Your session has expired. Sign in again.",
    );
    expect(screen.getByText("unauthenticated")).toBeTruthy();
    expect(sessionStorage.getItem("elimara_session_active")).toBeNull();
  });

  it("shows a recoverable error when session verification fails", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("Network unavailable"));

    renderAuth();

    expect((await screen.findByRole("alert")).textContent).toContain(
      "We couldn't verify your session",
    );
    expect(screen.getByText("unauthenticated")).toBeTruthy();
    expect(screen.getByText("no user")).toBeTruthy();
  });

  it("does not expose server details when session verification returns an error", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(503, {
        error: { code: "SERVICE_UNAVAILABLE", message: "Internal server detail" },
      }),
    );

    renderAuth();

    expect((await screen.findByRole("alert")).textContent).toContain(
      "We couldn't verify your session",
    );
    expect(screen.queryByText("Internal server detail")).toBeNull();
    expect(screen.getByText("unauthenticated")).toBeTruthy();
  });

  it("retries verification after a network failure", async () => {
    fetchMock
      .mockRejectedValueOnce(new TypeError("Network unavailable"))
      .mockResolvedValueOnce(
        jsonResponse(401, { error: { code: "UNAUTHENTICATED", message: "Unauthorized" } }),
      );

    renderAuth();

    await screen.findByRole("alert");
    fireEvent.click(screen.getByRole("button", { name: "Retry verification" }));

    expect(await screen.findByText("unauthenticated")).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("clears local identity after a successful logout", async () => {
    const queryClient = createQueryClient();
    queueAuthenticatedResponses();
    fetchMock.mockResolvedValueOnce(noContentResponse());

    renderAuth(queryClient);
    expect(await screen.findByText(user.email)).toBeTruthy();
    queryClient.setQueryData(["school-data", "school-1"], ["sensitive"]);
    queryClient.setQueryData(["unrelated-preference"], ["keep"]);

    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));

    expect(await screen.findByText("unauthenticated")).toBeTruthy();
    expect(screen.getByText("no user")).toBeTruthy();
    expect(screen.getByText("no school")).toBeTruthy();
    expect(queryClient.getQueryData(["school-data", "school-1"])).toBeUndefined();
    expect(queryClient.getQueryData(["unrelated-preference"])).toEqual(["keep"]);
  });

  it("clears sensitive cached data after a confirmed 401", async () => {
    const queryClient = createQueryClient();
    queryClient.setQueryData(["school-data", "school-1"], ["sensitive"]);
    queryClient.setQueryData(["unrelated-preference"], ["keep"]);
    fetchMock.mockResolvedValueOnce(
      jsonResponse(401, { error: { code: "UNAUTHENTICATED", message: "Unauthorized" } }),
    );

    renderAuth(queryClient);

    expect(await screen.findByText("unauthenticated")).toBeTruthy();
    expect(queryClient.getQueryData(["school-data", "school-1"])).toBeUndefined();
    expect(queryClient.getQueryData(["unrelated-preference"])).toEqual(["keep"]);
  });

  it("keeps the identity available and reports a failed logout", async () => {
    queueAuthenticatedResponses();
    fetchMock.mockResolvedValueOnce(
      jsonResponse(500, { error: { code: "SERVER_ERROR", message: "Internal detail" } }),
    );

    renderAuth();
    expect(await screen.findByText(user.email)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));

    expect((await screen.findByRole("alert")).textContent).toContain(
      "Sign-out could not be confirmed",
    );
    expect(screen.getByText("authenticated")).toBeTruthy();
    expect(screen.getByText(user.email)).toBeTruthy();
    expect(screen.queryByText("Internal detail")).toBeNull();
  });

  it("clears scoped cached data on logout and sends the CSRF token", async () => {
    const queryClient = createQueryClient();
    document.cookie = "elimara_csrf=test-csrf";
    queueAuthenticatedResponses();
    fetchMock.mockResolvedValueOnce(noContentResponse());
    renderAuth(queryClient);
    expect(await screen.findByText(user.email)).toBeTruthy();
    queryClient.setQueryData(["school-data", "school-1"], ["sensitive"]);
    queryClient.setQueryData(["unrelated-preference"], ["keep"]);

    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));

    expect(await screen.findByText("unauthenticated")).toBeTruthy();
    expect(queryClient.getQueryData(["school-data", "school-1"])).toBeUndefined();
    expect(queryClient.getQueryData(["unrelated-preference"])).toEqual(["keep"]);
    const logoutCall = fetchMock.mock.calls.find(
      ([input, init]) => String(input).endsWith("/auth/logout") && init?.method === "POST",
    );
    expect(new Headers(logoutCall?.[1]?.headers).get("X-CSRF-Token")).toBe("test-csrf");
  });

  it("clears school-scoped cache when the selected school changes", async () => {
    const queryClient = createQueryClient();
    queueAuthenticatedResponses();
    renderAuth(queryClient);
    expect(await screen.findByText("authenticated")).toBeTruthy();
    queryClient.setQueryData(["school-data", "school-1", "/students"], ["school one"]);
    queryClient.setQueryData(["school-data", "school-2", "/students"], ["school two"]);
    queryClient.setQueryData(["platform-access"], { access: "platform" });
    queryClient.setQueryData(["unrelated-preference"], ["keep"]);

    fireEvent.click(screen.getByRole("button", { name: "Select another school" }));

    expect(await screen.findByText("school-2")).toBeTruthy();
    expect(queryClient.getQueryData(["school-data", "school-1", "/students"])).toBeUndefined();
    expect(queryClient.getQueryData(["school-data", "school-2", "/students"])).toBeUndefined();
    expect(queryClient.getQueryData(["platform-access"])).toEqual({ access: "platform" });
    expect(queryClient.getQueryData(["unrelated-preference"])).toEqual(["keep"]);
  });

  it("clears identity and scoped cache when an authenticated request reports an expired session", async () => {
    const queryClient = createQueryClient();
    queueAuthenticatedResponses();
    renderAuth(queryClient);
    expect(await screen.findByText(user.email)).toBeTruthy();
    queryClient.setQueryData(["school-data", "school-1", "/students"], ["sensitive"]);
    queryClient.setQueryData(["platform-access"], { access: "platform" });
    queryClient.setQueryData(["unrelated-preference"], ["keep"]);

    window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));

    expect(await screen.findByText("unauthenticated")).toBeTruthy();
    expect((await screen.findByRole("alert")).textContent).toContain(
      "Your session has expired. Sign in again.",
    );
    expect(queryClient.getQueryData(["school-data", "school-1", "/students"])).toBeUndefined();
    expect(queryClient.getQueryData(["platform-access"])).toBeUndefined();
    expect(queryClient.getQueryData(["unrelated-preference"])).toEqual(["keep"]);
    expect(sessionStorage.getItem("elimara_school_id")).toBeNull();
  });

  it("clears local session state when logout confirms the session is already expired", async () => {
    queueAuthenticatedResponses();
    fetchMock.mockResolvedValueOnce(
      jsonResponse(401, { error: { code: "UNAUTHENTICATED", message: "Internal detail" } }),
    );
    renderAuth();
    expect(await screen.findByText(user.email)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));

    expect(await screen.findByText("unauthenticated")).toBeTruthy();
    expect((await screen.findByRole("alert")).textContent).toContain(
      "Your session has expired. Sign in again.",
    );
    expect(screen.queryByText("Internal detail")).toBeNull();
  });

  it("loads backend memberships and lets the user select a school", async () => {
    queueAuthenticatedResponses();
    renderAuth();

    expect(await screen.findByText("authenticated")).toBeTruthy();
    expect(screen.getByText("no school")).toBeTruthy();
    expect(screen.getByText("2")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Select another school" }));
    expect(await screen.findByText("school-2")).toBeTruthy();
  });

  it("submits login then loads identity and active memberships", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(401, { error: { code: "UNAUTHENTICATED" } }))
      .mockResolvedValueOnce(jsonResponse(200, { data: { user } }))
      .mockResolvedValueOnce(jsonResponse(200, { data: { user } }))
      .mockResolvedValueOnce(jsonResponse(200, { data: schools }));
    renderAuth();
    await screen.findByText("unauthenticated");

    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByText(user.email)).toBeTruthy();
    const loginCall = fetchMock.mock.calls.find(
      ([input, init]) => String(input).endsWith("/auth/login") && init?.method === "POST",
    );
    expect(JSON.parse(String(loginCall?.[1]?.body))).toEqual({
      email: "admin@example.test",
      password: "correct-horse-battery-staple",
    });
    expect(loginCall?.[1]?.credentials).toBe("include");
    expect(sessionStorage.getItem("elimara_session_active")).toBe("true");
    expect(localStorage.getItem("elimara_session_token")).toBeNull();
  });
});
