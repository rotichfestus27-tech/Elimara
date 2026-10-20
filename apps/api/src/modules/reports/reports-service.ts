import type {
  AcademicSummary,
  AttendanceSummaryRow,
  FinanceReport,
  StudentPageQuery,
  StudentRecord,
  StaffPageQuery,
  StaffRecord,
} from "@elimara/database";
import type { AdmissionsService } from "../admissions/admissions-service.js";
import type { AssessmentService } from "../assessments/assessment-service.js";
import type { AttendanceService } from "../attendance/attendance-service.js";
import type { FinanceService } from "../finance/finance-service.js";
import type { StaffService } from "../staff/staff-service.js";

export type ReportsSources = {
  admissions: Pick<AdmissionsService, "listStudents">;
  attendance: Pick<AttendanceService, "summary">;
  assessments: Pick<AssessmentService, "academicSummary">;
  finance: Pick<FinanceService, "getReport">;
  staff: Pick<StaffService, "listStaff">;
};

export type ReportDateRange = { from: string; to: string };
export type AcademicReportFilter = {
  academicYearId: string;
  termId: string;
  classId?: string;
};

const exportLimit = 5_000;
const exportPageSize = 100;

export class ReportsService {
  constructor(private readonly sources: ReportsSources) {}

  async dashboard(schoolId: string, query: ReportDateRange & AcademicReportFilter) {
    const [attendance, academics, finance] = await Promise.all([
      this.attendance(schoolId, query),
      this.academics(schoolId, query),
      this.finance(schoolId, query),
    ]);
    return { attendance, academics, finance };
  }

  async students(schoolId: string, query: StudentPageQuery) {
    return this.sources.admissions.listStudents(schoolId, query);
  }

  async attendance(
    schoolId: string,
    query: ReportDateRange & {
      type?: "STUDENT_DAILY" | "STUDENT_LESSON" | "STAFF_DAILY";
      classId?: string;
    },
  ): Promise<AttendanceSummaryRow[]> {
    return this.sources.attendance.summary(schoolId, query);
  }

  async academics(schoolId: string, query: AcademicReportFilter): Promise<AcademicSummary> {
    return this.sources.assessments.academicSummary(schoolId, query);
  }

  async finance(schoolId: string, query: ReportDateRange): Promise<FinanceReport> {
    return this.sources.finance.getReport(schoolId, query.from, query.to);
  }

  async staff(schoolId: string, query: StaffPageQuery) {
    return this.sources.staff.listStaff(schoolId, query);
  }

  async exportStudents(
    schoolId: string,
    query: Omit<StudentPageQuery, "limit" | "offset">,
  ): Promise<StudentRecord[]> {
    return this.collectPages(async (offset, limit) =>
      this.sources.admissions.listStudents(schoolId, { ...query, limit, offset }),
    );
  }

  async exportStaff(
    schoolId: string,
    query: Omit<StaffPageQuery, "limit" | "offset">,
  ): Promise<StaffRecord[]> {
    return this.collectPages(async (offset, limit) =>
      this.sources.staff.listStaff(schoolId, { ...query, limit, offset }),
    );
  }

  private async collectPages<T>(
    fetchPage: (offset: number, limit: number) => Promise<{ items: T[]; total: number }>,
  ): Promise<T[]> {
    const first = await fetchPage(0, exportPageSize);
    if (first.total > exportLimit) {
      throw new ReportExportTooLargeError(exportLimit);
    }

    const rows = [...first.items];
    for (let offset = first.items.length; offset < first.total; offset += exportPageSize) {
      const page = await fetchPage(offset, exportPageSize);
      rows.push(...page.items);
    }
    return rows;
  }
}

export class ReportExportTooLargeError extends Error {
  constructor(readonly maximumRows: number) {
    super(`Synchronous CSV exports are limited to ${maximumRows} rows.`);
    this.name = "ReportExportTooLargeError";
  }
}
