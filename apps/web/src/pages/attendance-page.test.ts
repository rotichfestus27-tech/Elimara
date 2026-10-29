import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { jsonResponse } from "@/test-utils/mock-response";
import { markAttendanceAttendees } from "./attendance-page";

const fetchMock = vi.fn<typeof fetch>();

describe("markAttendanceAttendees", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("continues after individual failures and returns partial results", async () => {
    fetchMock.mockImplementation(async (_input, init) => {
      const body = JSON.parse(String(init?.body)) as { studentId: string };
      if (body.studentId === "student-2") {
        return jsonResponse(409, {
          error: { code: "CONFLICT", message: "Attendance already exists." },
        });
      }
      return jsonResponse(201, { id: `record-${body.studentId}` });
    });

    const result = await markAttendanceAttendees("school-1", "register-1", [
      { studentId: "student-1", name: "Amina Njeri" },
      { studentId: "student-2", name: "Brian Otieno" },
      { studentId: "student-3", name: "Chao Kimani" },
    ]);

    expect(result).toEqual({
      attemptedCount: 3,
      markedCount: 2,
      failedNames: ["Brian Otieno"],
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});
