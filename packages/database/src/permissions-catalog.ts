import type { PrismaClient } from "@prisma/client";

export interface SystemPermissionDefinition {
  key: string;
  description: string;
  category: string;
}

export const SYSTEM_PERMISSIONS: readonly SystemPermissionDefinition[] = [
  // School Profile
  {
    key: "school.profile.read",
    description: "View school profile, general settings, and operational details",
    category: "school",
  },
  {
    key: "school.profile.update",
    description: "Update school profile, branding, address, and operational settings",
    category: "school",
  },

  // Academics
  {
    key: "academics.configuration.read",
    description: "View academic years, terms, classes, streams, and subject configurations",
    category: "academics",
  },
  {
    key: "academics.configuration.manage",
    description: "Create, update, and manage academic structure, classes, streams, and subjects",
    category: "academics",
  },

  // Admissions & Applications
  {
    key: "admissions.application.read",
    description: "View admission applications and applicant details",
    category: "admissions",
  },
  {
    key: "admissions.application.create",
    description: "Create and draft new admission applications",
    category: "admissions",
  },
  {
    key: "admissions.application.review",
    description: "Review, accept, or reject admission applications",
    category: "admissions",
  },
  {
    key: "admissions.application.admit",
    description: "Admit students and finalize admission enrollment",
    category: "admissions",
  },

  // Students & Guardians
  {
    key: "students.profile.read",
    description: "View student profiles, enrollment status, and records",
    category: "students",
  },
  {
    key: "students.profile.update",
    description: "Update student demographic, contact, and medical information",
    category: "students",
  },
  {
    key: "students.profile.status",
    description: "Update student enrollment status, suspend, withdraw, or archive students",
    category: "students",
  },
  {
    key: "students.guardian.manage",
    description: "Link, update, and manage guardians and emergency contacts for students",
    category: "students",
  },
  {
    key: "students.placement.manage",
    description: "Assign and transfer students across academic classes and streams",
    category: "students",
  },
  {
    key: "guardians.profile.read",
    description: "View guardian profiles, contacts, and linked student relationships",
    category: "guardians",
  },
  {
    key: "guardians.profile.manage",
    description: "Create and update guardian profiles and custody relationships",
    category: "guardians",
  },

  // Staff & HR
  {
    key: "staff.profile.read",
    description: "View staff directory, profiles, qualifications, and employment status",
    category: "staff",
  },
  {
    key: "staff.profile.manage",
    description: "Create and update staff profiles, personal details, and departments",
    category: "staff",
  },
  {
    key: "staff.employment.read",
    description: "View staff employment contracts, stints, and compensation records",
    category: "staff",
  },
  {
    key: "staff.employment.manage",
    description: "Create, modify, and end staff employment stints and status changes",
    category: "staff",
  },
  {
    key: "staff.assignment.read",
    description: "View class teacher and subject teacher assignments",
    category: "staff",
  },
  {
    key: "staff.assignment.manage",
    description: "Assign and unassign teachers to classes and subject offerings",
    category: "staff",
  },

  // Attendance & Timetable
  {
    key: "attendance.register.read",
    description: "View daily and lesson-level attendance registers and student records",
    category: "attendance",
  },
  {
    key: "attendance.register.manage",
    description: "Generate registers, take attendance, and mark student statuses",
    category: "attendance",
  },
  {
    key: "attendance.register.correct",
    description: "Correct and amend historical attendance records with audit logging",
    category: "attendance",
  },
  {
    key: "timetable.read",
    description: "View school timetables, class schedules, and period definitions",
    category: "timetable",
  },
  {
    key: "timetable.manage",
    description: "Create and configure timetables, period definitions, and lesson slots",
    category: "timetable",
  },
  {
    key: "timetable.publish",
    description: "Publish, activate, and archive school timetables",
    category: "timetable",
  },

  // Assessments & Grading
  {
    key: "assessments.read",
    description: "View assessment schedules, configurations, and grading scales",
    category: "assessments",
  },
  {
    key: "assessments.manage",
    description: "Create and configure assessments, tests, exams, and grading scales",
    category: "assessments",
  },
  {
    key: "results.enter",
    description: "Enter raw assessment scores and teacher feedback for students",
    category: "results",
  },
  {
    key: "results.correct",
    description: "Correct and amend entered marks before finalization",
    category: "results",
  },
  {
    key: "results.moderate",
    description: "Review, audit, and moderate class assessment scores",
    category: "results",
  },
  {
    key: "results.finalize",
    description: "Finalize assessment results and generate term grade summaries",
    category: "results",
  },
  {
    key: "results.publish",
    description: "Publish finalized grades and generate academic report cards and transcripts",
    category: "results",
  },

  // Finance & Billing
  {
    key: "finance.fees.read",
    description: "View fee structures, items, and billing schedules",
    category: "finance",
  },
  {
    key: "finance.fees.manage",
    description: "Configure fee structures and termly amounts",
    category: "finance",
  },
  {
    key: "finance.accounts.read",
    description: "View student financial accounts, statements, and ledgers",
    category: "finance",
  },
  {
    key: "finance.charges.post",
    description: "Post fee charges and termly billings to student accounts",
    category: "finance",
  },
  {
    key: "finance.payments.read",
    description: "View payment transactions, allocations, and receipts",
    category: "finance",
  },
  {
    key: "finance.payments.record",
    description: "Record fee payments, transactions, and cash receipts",
    category: "finance",
  },
  {
    key: "finance.payments.reconcile",
    description: "Reconcile payment transactions with bank and mobile money statements",
    category: "finance",
  },
  {
    key: "finance.adjustments.manage",
    description: "Apply fee adjustments, waivers, bursaries, and discounts",
    category: "finance",
  },
  {
    key: "finance.refunds.manage",
    description: "Authorize and process financial payment refunds",
    category: "finance",
  },
  {
    key: "finance.reports.read",
    description: "View financial summary reports, collection summaries, and aged balances",
    category: "finance",
  },
  {
    key: "finance.receipts.read",
    description: "View, download, and print official fee payment receipts",
    category: "finance",
  },

  // Library
  {
    key: "library.catalog.read",
    description: "Search and browse library items, copies, and categories",
    category: "library",
  },
  {
    key: "library.catalog.manage",
    description: "Create and update books, categories, and inventory copies",
    category: "library",
  },
  {
    key: "library.loans.read",
    description: "View active and past library loans and circulation history",
    category: "library",
  },
  {
    key: "library.loans.manage",
    description: "Issue, return, and renew library book loans",
    category: "library",
  },
  {
    key: "library.reservations.read",
    description: "View book hold queues and reservation statuses",
    category: "library",
  },
  {
    key: "library.reservations.manage",
    description: "Queue, ready, cancel, and fulfill book reservations",
    category: "library",
  },
  {
    key: "library.policy.manage",
    description: "Configure loan periods, limits, and circulation policies",
    category: "library",
  },
  {
    key: "library.reports.read",
    description: "View circulation reports, overdue items, and library stats",
    category: "library",
  },

  // Reports
  {
    key: "reports.dashboard.read",
    description: "View executive summary metrics and dashboard analytics",
    category: "reports",
  },
  {
    key: "reports.students.read",
    description: "Generate demographic and student enrollment reports",
    category: "reports",
  },
  {
    key: "reports.attendance.read",
    description: "Generate student and staff attendance summary reports",
    category: "reports",
  },
  {
    key: "reports.academics.read",
    description: "Generate academic performance and grade distribution reports",
    category: "reports",
  },
  {
    key: "reports.finance.read",
    description: "Generate fee collection and revenue summary reports",
    category: "reports",
  },
  {
    key: "reports.staff.read",
    description: "Generate staff assignment and workload reports",
    category: "reports",
  },
  {
    key: "reports.exports.generate",
    description: "Export reports to CSV, spreadsheet, and PDF formats",
    category: "reports",
  },

  // Communication
  {
    key: "communication.notifications.read",
    description: "View system notifications, dispatched alerts, and logs",
    category: "communication",
  },
] as const;

export type SystemPermissionKey = (typeof SYSTEM_PERMISSIONS)[number]["key"];

export async function seedSystemPermissions(
  prisma: PrismaClient,
): Promise<{ insertedOrUpdated: number }> {
  for (const permission of SYSTEM_PERMISSIONS) {
    await prisma.permission.upsert({
      where: { key: permission.key },
      create: {
        key: permission.key,
        description: permission.description,
      },
      update: {
        description: permission.description,
      },
    });
  }
  return { insertedOrUpdated: SYSTEM_PERMISSIONS.length };
}
