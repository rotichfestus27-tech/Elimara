import { describe, expect, it } from "vitest";
import { isWithinAvailability, timetableConflict, type TimetableSlot } from "@elimara/database";

function slot(overrides: Partial<TimetableSlot> = {}): TimetableSlot {
  return {
    weekday: "MONDAY",
    classId: "class-a",
    streamId: null,
    staffId: "teacher-a",
    roomId: "room-a",
    startsAt: new Date("1970-01-01T09:00:00.000Z"),
    endsAt: new Date("1970-01-01T10:00:00.000Z"),
    ...overrides,
  };
}

describe("timetable conflict rules", () => {
  it("detects overlapping lessons for the same teacher, class, or room", () => {
    expect(timetableConflict(slot(), [slot({ classId: "class-b", roomId: "room-b" })])).toBe(
      "TEACHER",
    );
    expect(timetableConflict(slot(), [slot({ staffId: "teacher-b", roomId: "room-b" })])).toBe(
      "CLASS",
    );
    expect(timetableConflict(slot(), [slot({ classId: "class-b", staffId: "teacher-b" })])).toBe(
      "ROOM",
    );
  });

  it("treats class-wide and stream-specific lessons as overlapping, but allows separate streams", () => {
    const streamOne = slot({ streamId: "stream-a" });
    const streamTwo = slot({ streamId: "stream-b", staffId: "teacher-b", roomId: "room-b" });
    expect(timetableConflict(streamOne, [streamTwo])).toBeNull();
    expect(timetableConflict(slot(), [streamTwo])).toBe("CLASS");
  });

  it("allows adjacent periods and lessons on another weekday", () => {
    const adjacent = slot({
      startsAt: new Date("1970-01-01T10:00:00.000Z"),
      endsAt: new Date("1970-01-01T11:00:00.000Z"),
    });
    expect(timetableConflict(slot(), [adjacent])).toBeNull();
    expect(timetableConflict(slot(), [slot({ weekday: "TUESDAY" })])).toBeNull();
  });

  it("requires lessons to fit within configured teacher availability", () => {
    const windows = [
      {
        startsAt: new Date("1970-01-01T08:00:00.000Z"),
        endsAt: new Date("1970-01-01T12:00:00.000Z"),
      },
    ];
    expect(isWithinAvailability(slot().startsAt, slot().endsAt, windows)).toBe(true);
    expect(isWithinAvailability(new Date("1970-01-01T07:00:00Z"), slot().endsAt, windows)).toBe(
      false,
    );
    expect(isWithinAvailability(slot().startsAt, slot().endsAt, [])).toBe(true);
  });
});
