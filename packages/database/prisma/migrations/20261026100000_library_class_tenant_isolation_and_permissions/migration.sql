-- AlterTable
ALTER TABLE "library_loans" ADD COLUMN "academic_class_id" UUID;

-- AlterTable
ALTER TABLE "library_reservations" ADD COLUMN "academic_class_id" UUID;

-- CreateIndex
CREATE INDEX "library_loans_school_academic_class_idx" ON "library_loans"("school_id", "academic_class_id");

-- CreateIndex
CREATE INDEX "library_reservations_school_academic_class_idx" ON "library_reservations"("school_id", "academic_class_id");

-- AddForeignKey
ALTER TABLE "library_loans" ADD CONSTRAINT "library_loans_school_id_academic_class_id_fkey" FOREIGN KEY ("school_id", "academic_class_id") REFERENCES "academic_classes"("school_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "library_reservations" ADD CONSTRAINT "library_reservations_school_id_academic_class_id_fkey" FOREIGN KEY ("school_id", "academic_class_id") REFERENCES "academic_classes"("school_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "permissions" ADD COLUMN IF NOT EXISTS "description" TEXT NOT NULL DEFAULT '',
ADD COLUMN IF NOT EXISTS "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Seed Authoritative System Permissions
INSERT INTO "permissions" ("key", "description") VALUES
    ('school.profile.read', 'View school profile, general settings, and operational details'),
    ('school.profile.update', 'Update school profile, branding, address, and operational settings'),
    ('academics.configuration.read', 'View academic years, terms, classes, streams, and subject configurations'),
    ('academics.configuration.manage', 'Create, update, and manage academic structure, classes, streams, and subjects'),
    ('admissions.application.read', 'View admission applications and applicant details'),
    ('admissions.application.create', 'Create and draft new admission applications'),
    ('admissions.application.review', 'Review, accept, or reject admission applications'),
    ('admissions.application.admit', 'Admit students and finalize admission enrollment'),
    ('students.profile.read', 'View student profiles, enrollment status, and records'),
    ('students.profile.update', 'Update student demographic, contact, and medical information'),
    ('students.profile.status', 'Update student enrollment status, suspend, withdraw, or archive students'),
    ('students.guardian.manage', 'Link, update, and manage guardians and emergency contacts for students'),
    ('students.placement.manage', 'Assign and transfer students across academic classes and streams'),
    ('guardians.profile.read', 'View guardian profiles, contacts, and linked student relationships'),
    ('guardians.profile.manage', 'Create and update guardian profiles and custody relationships'),
    ('staff.profile.read', 'View staff directory, profiles, qualifications, and employment status'),
    ('staff.profile.manage', 'Create and update staff profiles, personal details, and departments'),
    ('staff.employment.read', 'View staff employment contracts, stints, and compensation records'),
    ('staff.employment.manage', 'Create, modify, and end staff employment stints and status changes'),
    ('staff.assignment.read', 'View class teacher and subject teacher assignments'),
    ('staff.assignment.manage', 'Assign and unassign teachers to classes and subject offerings'),
    ('attendance.register.read', 'View daily and lesson-level attendance registers and student records'),
    ('attendance.register.manage', 'Generate registers, take attendance, and mark student statuses'),
    ('attendance.register.correct', 'Correct and amend historical attendance records with audit logging'),
    ('timetable.read', 'View school timetables, class schedules, and period definitions'),
    ('timetable.manage', 'Create and configure timetables, period definitions, and lesson slots'),
    ('timetable.publish', 'Publish, activate, and archive school timetables'),
    ('assessments.read', 'View assessment schedules, configurations, and grading scales'),
    ('assessments.manage', 'Create and configure assessments, tests, exams, and grading scales'),
    ('results.enter', 'Enter raw assessment scores and teacher feedback for students'),
    ('results.correct', 'Correct and amend entered marks before finalization'),
    ('results.moderate', 'Review, audit, and moderate class assessment scores'),
    ('results.finalize', 'Finalize assessment results and generate term grade summaries'),
    ('results.publish', 'Publish finalized grades and generate academic report cards and transcripts'),
    ('finance.fees.read', 'View fee structures, items, and billing schedules'),
    ('finance.fees.manage', 'Configure fee structures and termly amounts'),
    ('finance.accounts.read', 'View student financial accounts, statements, and ledgers'),
    ('finance.charges.post', 'Post fee charges and termly billings to student accounts'),
    ('finance.payments.read', 'View payment transactions, allocations, and receipts'),
    ('finance.payments.record', 'Record fee payments, transactions, and cash receipts'),
    ('finance.payments.reconcile', 'Reconcile payment transactions with bank and mobile money statements'),
    ('finance.adjustments.manage', 'Apply fee adjustments, waivers, bursaries, and discounts'),
    ('finance.refunds.manage', 'Process and authorize fee refunds'),
    ('finance.reports.read', 'View financial summary reports, collection summaries, and aged balances'),
    ('finance.receipts.read', 'View, download, and print official fee payment receipts'),
    ('library.catalog.read', 'Search and browse library items, copies, and categories'),
    ('library.catalog.manage', 'Create and update books, categories, and inventory copies'),
    ('library.loans.read', 'View active and past library loans and circulation history'),
    ('library.loans.manage', 'Issue, return, and renew library book loans'),
    ('library.reservations.read', 'View book hold queues and reservation statuses'),
    ('library.reservations.manage', 'Queue, ready, cancel, and fulfill book reservations'),
    ('library.policy.manage', 'Configure loan periods, limits, and circulation policies'),
    ('library.reports.read', 'View circulation reports, overdue items, and library stats'),
    ('reports.dashboard.read', 'View executive summary metrics and dashboard analytics'),
    ('reports.students.read', 'Generate demographic and student enrollment reports'),
    ('reports.attendance.read', 'Generate student and staff attendance summary reports'),
    ('reports.academics.read', 'Generate academic performance and grade distribution reports'),
    ('reports.finance.read', 'Generate fee collection and revenue summary reports'),
    ('reports.staff.read', 'Generate staff assignment and workload reports'),
    ('reports.exports.generate', 'Export reports to CSV, spreadsheet, and PDF formats'),
    ('communication.notifications.read', 'View system notifications, dispatched alerts, and logs')
ON CONFLICT ("key") DO UPDATE SET "description" = EXCLUDED."description";
