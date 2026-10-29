import { afterEach, describe, expect, it, vi } from "vitest";
import {
  type ApiClientError,
  apiRequest,
  downloadReport,
  SESSION_EXPIRED_EVENT,
} from "./client";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("API client error handling", () => {
  it("preserves structured API errors for JSON requests", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>().mockResolvedValue(
        new Response(
          JSON.stringify({
            error: {
              code: "VALIDATION_FAILED",
              message: "Check the submitted values.",
              issues: [{ path: "name", message: "Required." }],
            },
          }),
          { status: 422, headers: { "Content-Type": "application/json" } },
        ),
      ),
    );

    const request = apiRequest("/schools/school-1/students");

    await expect(request).rejects.toMatchObject({
      name: "ApiClientError",
      message: "Check the submitted values.",
      status: 422,
      code: "VALIDATION_FAILED",
      issues: [{ path: "name", message: "Required." }],
    });
  });

  it("uses the request fallback when an error response is not JSON", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>().mockResolvedValue(
        new Response("not JSON", {
          status: 503,
        }),
      ),
    );

    await expect(apiRequest("/schools/school-1/students")).rejects.toMatchObject({
      name: "ApiClientError",
      message: "The request could not be completed.",
      status: 503,
      code: "REQUEST_FAILED",
      issues: [],
    });
  });

  it("uses the report-specific fallback for download errors", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>().mockResolvedValue(
        new Response("not JSON", {
          status: 500,
        }),
      ),
    );

    await expect(
      downloadReport("/schools/school-1/reports/export", "report.csv"),
    ).rejects.toMatchObject({
      name: "ApiClientError",
      message: "The report could not be generated.",
      status: 500,
      code: "REQUEST_FAILED",
    } satisfies Partial<ApiClientError>);
  });

  it("signals session expiry for protected API requests but not failed login attempts", async () => {
    const expiredHandler = vi.fn();
    window.addEventListener(SESSION_EXPIRED_EVENT, expiredHandler);
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        new Response(JSON.stringify({ error: { code: "UNAUTHENTICATED" } }), { status: 401 }),
      );
    vi.stubGlobal("fetch", fetchMock);

    await expect(apiRequest("/schools/school-1/students")).rejects.toMatchObject({
      status: 401,
    });
    expect(expiredHandler).toHaveBeenCalledTimes(1);

    await expect(
      apiRequest("/auth/login", { method: "POST", body: { email: "bad", password: "bad" } }),
    ).rejects.toMatchObject({ status: 401 });
    expect(expiredHandler).toHaveBeenCalledTimes(1);
    window.removeEventListener(SESSION_EXPIRED_EVENT, expiredHandler);
  });
});
