import { ApiError } from "../errors/api-error.js";

export const DEFAULT_DATABASE_READY_TIMEOUT_MS = 2_000;

/**
 * Executes an async operation with a strict timeout.
 *
 * Guarantees:
 * 1. Immediate timer cleanup when operation resolves or rejects before timeout.
 * 2. Rejection with ApiError(503, "SERVICE_NOT_READY", ...) if the operation exceeds timeoutMs.
 * 3. Safe suppression of late unhandled promise rejections if the underlying operation
 *    eventually fails after the timeout has already triggered.
 */
export async function executeWithTimeout<T>(
  operation: () => Promise<T>,
  timeoutMs: number = DEFAULT_DATABASE_READY_TIMEOUT_MS,
  timeoutMessage = "Database readiness check timed out.",
): Promise<T> {
  let timer: NodeJS.Timeout | undefined;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new ApiError(503, "SERVICE_NOT_READY", timeoutMessage));
    }, timeoutMs);
    timer.unref?.();
  });

  const opPromise = Promise.resolve().then(() => operation());
  opPromise.catch(() => {});

  try {
    return await Promise.race([opPromise, timeoutPromise]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}
