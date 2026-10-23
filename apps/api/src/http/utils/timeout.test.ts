import { describe, expect, it } from "vitest";
import { DEFAULT_DATABASE_READY_TIMEOUT_MS, executeWithTimeout } from "./timeout.js";

describe("executeWithTimeout", () => {
  it("resolves promptly when the operation finishes within the timeout", async () => {
    const result = await executeWithTimeout(async () => "success", 100);
    expect(result).toBe("success");
  });

  it("propagates original errors when the operation rejects before the timeout", async () => {
    const customError = new Error("Database socket closed");
    await expect(
      executeWithTimeout(async () => {
        throw customError;
      }, 100),
    ).rejects.toThrow("Database socket closed");
  });

  it("rejects with ApiError 503 SERVICE_NOT_READY when operation exceeds timeout", async () => {
    const slowOperation = () =>
      new Promise<string>((resolve) => {
        setTimeout(() => resolve("late value"), 200);
      });

    const promise = executeWithTimeout(slowOperation, 25, "Database readiness check timed out.");

    await expect(promise).rejects.toMatchObject({
      statusCode: 503,
      code: "SERVICE_NOT_READY",
      message: "Database readiness check timed out.",
    });
  });

  it("safely swallows late unhandled rejections after timing out", async () => {
    let unhandledTriggered = false;
    const originalListener = (_err: unknown) => {
      unhandledTriggered = true;
    };
    process.on("unhandledRejection", originalListener);

    try {
      const slowFailingOperation = () =>
        new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error("Late network crash")), 40);
        });

      await expect(executeWithTimeout(slowFailingOperation, 15)).rejects.toMatchObject({
        statusCode: 503,
        code: "SERVICE_NOT_READY",
      });

      // Wait past the slow operation's timeout to ensure no unhandledRejection is triggered
      await new Promise((resolve) => setTimeout(resolve, 80));
      expect(unhandledTriggered).toBe(false);
    } finally {
      process.off("unhandledRejection", originalListener);
    }
  });

  it("uses default timeout constant when none is specified", () => {
    expect(DEFAULT_DATABASE_READY_TIMEOUT_MS).toBe(2000);
  });
});
