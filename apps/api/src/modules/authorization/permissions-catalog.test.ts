import { describe, expect, it } from "vitest";
import { SYSTEM_PERMISSIONS, type SystemPermissionKey } from "@elimara/database";

describe("Permissions Catalog", () => {
  it("contains all authoritative system permissions without duplicates", () => {
    const keys = SYSTEM_PERMISSIONS.map((permission) => permission.key);
    const uniqueKeys = new Set(keys);

    expect(keys.length).toBe(uniqueKeys.size);
    expect(keys.length).toBe(61);
  });

  it("ensures every permission definition has valid key, description, and category", () => {
    for (const permission of SYSTEM_PERMISSIONS) {
      expect(permission.key).toMatch(/^[a-z]+(\.[a-z_]+)+$/);
      expect(permission.description.trim().length).toBeGreaterThan(10);
      expect(permission.category.trim().length).toBeGreaterThan(2);
    }
  });

  it("covers all permissions referenced across school domains", () => {
    const registeredKeys = new Set<string>(SYSTEM_PERMISSIONS.map((p) => p.key));

    const domainPermissions: string[] = [
      // School
      "school.profile.read",
      "school.profile.update",
      // Academics
      "academics.configuration.read",
      "academics.configuration.manage",
      // Admissions & Students
      "admissions.application.read",
      "admissions.application.create",
      "admissions.application.review",
      "admissions.application.admit",
      "students.profile.read",
      "students.profile.update",
      "students.profile.status",
      "students.guardian.manage",
      "students.placement.manage",
      "guardians.profile.read",
      "guardians.profile.manage",
      // Staff
      "staff.profile.read",
      "staff.profile.manage",
      "staff.employment.read",
      "staff.employment.manage",
      "staff.assignment.read",
      "staff.assignment.manage",
      // Attendance & Timetable
      "attendance.register.read",
      "attendance.register.manage",
      "attendance.register.correct",
      "timetable.read",
      "timetable.manage",
      "timetable.publish",
      // Assessments & Grading
      "assessments.read",
      "assessments.manage",
      "results.enter",
      "results.correct",
      "results.moderate",
      "results.finalize",
      "results.publish",
      // Finance
      "finance.fees.read",
      "finance.fees.manage",
      "finance.accounts.read",
      "finance.charges.post",
      "finance.payments.read",
      "finance.payments.record",
      "finance.payments.reconcile",
      "finance.adjustments.manage",
      "finance.refunds.manage",
      "finance.reports.read",
      "finance.receipts.read",
      // Library
      "library.catalog.read",
      "library.catalog.manage",
      "library.loans.read",
      "library.loans.manage",
      "library.reservations.read",
      "library.reservations.manage",
      "library.policy.manage",
      "library.reports.read",
      // Reports
      "reports.dashboard.read",
      "reports.students.read",
      "reports.attendance.read",
      "reports.academics.read",
      "reports.finance.read",
      "reports.staff.read",
      "reports.exports.generate",
      // Communication
      "communication.notifications.read",
    ];

    expect(domainPermissions.length).toBe(61);
    for (const perm of domainPermissions) {
      expect(registeredKeys.has(perm)).toBe(true);
    }
  });
});
