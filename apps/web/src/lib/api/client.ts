export type ApiErrorBody = {
  error?: {
    code?: string;
    message?: string;
    issues?: Array<{ path?: string; message?: string }>;
  };
};

export class ApiClientError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
    readonly issues: Array<{ path?: string; message?: string }> = [],
  ) {
    super(message);
    this.name = "ApiClientError";
  }
}

const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL ?? "").replace(/\/+$/, "");
const csrfCookieName = import.meta.env.VITE_CSRF_COOKIE_NAME || "elimara_csrf";

export async function apiRequest<T>(
  path: string,
  options: {
    method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
    body?: unknown;
    signal?: AbortSignal;
    headers?: Record<string, string>;
  } = {},
): Promise<T> {
  const method = options.method ?? "GET";
  const headers = new Headers({ Accept: "application/json" });
  if (options.body !== undefined) headers.set("Content-Type", "application/json");
  if (options.headers) {
    for (const [key, value] of Object.entries(options.headers)) {
      headers.set(key, value);
    }
  }
  if (method !== "GET") {
    const csrfToken = readCookie(csrfCookieName);
    if (csrfToken) headers.set("X-CSRF-Token", csrfToken);
  }

  let response: Response;
  try {
    response = await fetch(`${apiBaseUrl}/api/v1${path}`, {
      method,
      credentials: "include",
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: options.signal,
    });
  } catch {
    throw new ApiClientError(
      "The service could not be reached. Check your connection and try again.",
      0,
      "NETWORK_ERROR",
    );
  }

  if (response.status === 204) return undefined as T;

  const payload: unknown = await response.json().catch(() => undefined);
  if (!response.ok) {
    const error = isApiErrorBody(payload) ? payload.error : undefined;
    throw new ApiClientError(
      error?.message ?? "The request could not be completed.",
      response.status,
      error?.code ?? "REQUEST_FAILED",
      error?.issues ?? [],
    );
  }
  return payload as T;
}

export async function downloadReport(path: string, fileName: string): Promise<void> {
  let response: Response;
  try {
    response = await fetch(`${apiBaseUrl}/api/v1${path}`, {
      credentials: "include",
      headers: { Accept: "text/csv" },
    });
  } catch {
    throw new ApiClientError(
      "The service could not be reached. Check your connection and try again.",
      0,
      "NETWORK_ERROR",
    );
  }

  if (!response.ok) {
    const payload: unknown = await response.json().catch(() => undefined);
    const error = isApiErrorBody(payload) ? payload.error : undefined;
    throw new ApiClientError(
      error?.message ?? "The report could not be generated.",
      response.status,
      error?.code ?? "REQUEST_FAILED",
      error?.issues ?? [],
    );
  }

  const objectUrl = URL.createObjectURL(await response.blob());
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(objectUrl);
}

function readCookie(name: string): string | undefined {
  const prefix = `${name}=`;
  return document.cookie
    .split(";")
    .map((cookie) => cookie.trim())
    .find((cookie) => cookie.startsWith(prefix))
    ?.slice(prefix.length);
}

function isApiErrorBody(value: unknown): value is ApiErrorBody & {
  error: NonNullable<ApiErrorBody["error"]>;
} {
  return typeof value === "object" && value !== null && "error" in value;
}
