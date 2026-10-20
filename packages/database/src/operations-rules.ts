export type TimetableSlot = {
  weekday: string;
  classId: string;
  streamId: string | null;
  staffId: string;
  roomId: string | null;
  startsAt: Date;
  endsAt: Date;
};

export type TimetableConflict = "TEACHER" | "CLASS" | "ROOM";

export function timetableConflict(
  candidate: TimetableSlot,
  existing: TimetableSlot[],
): TimetableConflict | null {
  for (const lesson of existing) {
    if (lesson.weekday !== candidate.weekday || !overlaps(candidate, lesson)) continue;
    if (lesson.staffId === candidate.staffId) return "TEACHER";
    if (
      lesson.classId === candidate.classId &&
      (!lesson.streamId || !candidate.streamId || lesson.streamId === candidate.streamId)
    ) {
      return "CLASS";
    }
    if (candidate.roomId && candidate.roomId === lesson.roomId) return "ROOM";
  }
  return null;
}

export function isWithinAvailability(
  startsAt: Date,
  endsAt: Date,
  windows: { startsAt: Date; endsAt: Date }[],
): boolean {
  return (
    windows.length === 0 ||
    windows.some((window) => window.startsAt <= startsAt && window.endsAt >= endsAt)
  );
}

function overlaps(first: TimetableSlot, second: TimetableSlot): boolean {
  return first.startsAt < second.endsAt && first.endsAt > second.startsAt;
}
