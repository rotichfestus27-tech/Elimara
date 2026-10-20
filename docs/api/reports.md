# Reports and exports

**Phase 10 API proposal — review DTOs with the frontend owner before adopting
them as shared contracts.**

All reports are school-scoped and use existing domain services and source
records. Each report requires both its report permission and its source-domain
permission. Permission definitions do not grant access to any role.

| Report | Definition |
| --- | --- |
| Dashboard | Composite of attendance date/status counts, academic assessment completion, and the existing exact-decimal finance summary. It does not infer percentage KPIs. |
| Students | Paginated student records with admission number, names, status, and creation timestamp. |
| Attendance | Inclusive date-range counts grouped by attendance status, optionally filtered by register type and class. No attendance rate or penalty is inferred. |
| Academics | Existing assessment/result completeness counts for the selected academic year and term; marks and grades are not recalculated. |
| Finance | Existing finance report with payments received/count, charges count, outstanding charges, unapplied credit, and reconciliation exceptions. |
| Staff | Paginated staff directory with staff number, names, position, department, and status; not payroll or workload data. |

Routes are under `/api/v1/schools/{schoolId}/reports`:

| Method/path | Permission requirements |
| --- | --- |
| `GET /dashboard?from&to&academicYearId&termId&classId` | `reports.dashboard.read`, `attendance.register.read`, `assessments.read`, `finance.reports.read` |
| `GET /students` | `reports.students.read`, `students.profile.read` |
| `GET /attendance?from&to&type&classId` | `reports.attendance.read`, `attendance.register.read` |
| `GET /academics?academicYearId&termId&classId` | `reports.academics.read`, `assessments.read` |
| `GET /finance?from&to` | `reports.finance.read`, `finance.reports.read` |
| `GET /staff` | `reports.staff.read`, `staff.profile.read` |
| `GET /{students,attendance,academics,finance,staff}/export.csv` | `reports.exports.generate` plus the matching report and source permissions above |

Student and staff reports accept bounded pagination (`limit` 1–100,
`offset` 0–1,000,000) and allowlisted filters/sort options. Date windows are
inclusive, ordered, and limited to 366 calendar days. Invalid filters return
`400 VALIDATION_FAILED`; authorization and inaccessible-school behavior follow
the established `401`, `403`, and non-disclosing `404` conventions.

CSV is generated synchronously with `text/csv`, a private no-store cache
policy, quoted/escaped values, and spreadsheet-formula neutralization.
Student/staff exports fetch in pages and reject totals over 5,000 rows with
`413 REPORT_EXPORT_TOO_LARGE`; no partial file is returned. Student dates of
birth, guardian details, marks, and staff contacts/account links are excluded.
Report reads and exports are audited with report type and request ID, not
filters or personal data.

Excel/PDF, async export jobs, private file storage, download tokens/URLs,
expiry/retention, scheduled reports, and platform/branch scopes are deferred
until formats, storage, and retention policies are approved. The first
implementation bounds and streams no large retained files, so no job/download
ID exists. A bounded Library loan summary is now available under the Library
module; it is not composed into this global Reports dashboard. Transport,
retention trends, teacher workload, and communication delivery reports await
their source modules/policies.

See [`reports.openapi.yaml`](reports.openapi.yaml) for the machine-readable
contract proposal.
