import { vi } from "vitest";

export function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: "",
    headers: {
      get: (name: string) => (name.toLowerCase() === "content-type" ? "application/json" : null),
    },
    json: vi.fn().mockResolvedValue(body),
  } as unknown as Response;
}

export function noContentResponse(): Response {
  return {
    ok: true,
    status: 204,
    statusText: "",
    headers: { get: () => null },
  } as unknown as Response;
}
