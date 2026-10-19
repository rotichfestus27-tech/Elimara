import { randomUUID } from "node:crypto";
import {
  type LibraryCategoryRecord,
  type LibraryCopyRecord,
  type LibraryItemRecord,
  type LibraryLoanRecord,
  type LibraryLoanReport,
  type LibraryPage,
  type LibraryPolicyRecord,
  type LibraryReservationRecord,
  type LibraryStore,
  LibraryStoreError,
} from "@elimara/database";

export class FakeLibraryStore implements LibraryStore {
  readonly categories = new Map<string, LibraryCategoryRecord>();
  readonly items = new Map<string, LibraryItemRecord>();
  readonly copies = new Map<string, LibraryCopyRecord>();
  readonly policies = new Map<string, LibraryPolicyRecord>();
  readonly loans = new Map<string, LibraryLoanRecord>();
  readonly reservations = new Map<string, LibraryReservationRecord>();
  readonly auditEvents: string[] = [];
  private readonly recordSchools = new Map<string, string>();
  private readonly activeStudents = new Map<string, Set<string>>();
  private readonly activeStaff = new Map<string, Set<string>>();

  seedStudent(schoolId: string, studentId: string) {
    const students = this.activeStudents.get(schoolId) ?? new Set<string>();
    students.add(studentId);
    this.activeStudents.set(schoolId, students);
  }

  seedStaff(schoolId: string, staffId: string) {
    const staff = this.activeStaff.get(schoolId) ?? new Set<string>();
    staff.add(staffId);
    this.activeStaff.set(schoolId, staff);
  }

  async listCategories(schoolId: string, query: Parameters<LibraryStore["listCategories"]>[1]) {
    return page(
      [...this.categories.values()].filter(
        (record) =>
          this.belongs(record.id, schoolId) &&
          (query.includeArchived || record.archivedAt === null),
      ),
      query,
    );
  }

  async createCategory(input: Parameters<LibraryStore["createCategory"]>[0]) {
    if (
      [...this.categories.values()].some(
        (record) =>
          this.belongs(record.id, input.schoolId) &&
          record.name.trim().toLowerCase() === input.name.trim().toLowerCase(),
      )
    ) {
      throw error("DUPLICATE", "Duplicate category.");
    }
    const now = new Date();
    const record: LibraryCategoryRecord = {
      id: randomUUID(),
      name: input.name,
      archivedAt: null,
      createdAt: now,
      updatedAt: now,
    };
    this.store(record.id, input.schoolId, this.categories, record);
    this.auditEvents.push("LIBRARY_CATEGORY_CREATED");
    return record;
  }

  async archiveCategory(input: Parameters<LibraryStore["archiveCategory"]>[0]) {
    const record = this.categories.get(input.categoryId);
    if (!record || !this.belongs(record.id, input.schoolId) || record.archivedAt) return false;
    this.categories.set(record.id, { ...record, archivedAt: new Date(), updatedAt: new Date() });
    this.auditEvents.push("LIBRARY_CATEGORY_ARCHIVED");
    return true;
  }

  async listItems(schoolId: string, query: Parameters<LibraryStore["listItems"]>[1]) {
    const records = [...this.items.values()].filter(
      (record) =>
        this.belongs(record.id, schoolId) &&
        (query.includeArchived || record.archivedAt === null) &&
        (!query.categoryId || record.categoryId === query.categoryId) &&
        (!query.search || record.title.toLowerCase().includes(query.search.toLowerCase())),
    );
    return page(records, query);
  }

  async getItem(schoolId: string, itemId: string) {
    const item = this.items.get(itemId);
    return item && this.belongs(itemId, schoolId) ? item : null;
  }

  async createItem(input: Parameters<LibraryStore["createItem"]>[0]) {
    if (input.categoryId && !this.hasActiveCategory(input.schoolId, input.categoryId)) {
      throw error("INVALID_RELATIONSHIP", "An active category is required.");
    }
    const now = new Date();
    const item: LibraryItemRecord = {
      id: randomUUID(),
      title: input.title,
      author: input.author ?? null,
      isbn: input.isbn ?? null,
      categoryId: input.categoryId ?? null,
      archivedAt: null,
      createdAt: now,
      updatedAt: now,
    };
    this.store(item.id, input.schoolId, this.items, item);
    this.auditEvents.push("LIBRARY_ITEM_CREATED");
    return item;
  }

  async updateItem(input: Parameters<LibraryStore["updateItem"]>[0]) {
    const item = this.items.get(input.itemId);
    if (!item || !this.belongs(item.id, input.schoolId) || item.archivedAt) return null;
    if (input.categoryId && !this.hasActiveCategory(input.schoolId, input.categoryId)) {
      throw error("INVALID_RELATIONSHIP", "An active category is required.");
    }
    const updated = {
      ...item,
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.author !== undefined ? { author: input.author } : {}),
      ...(input.isbn !== undefined ? { isbn: input.isbn } : {}),
      ...(input.categoryId !== undefined ? { categoryId: input.categoryId } : {}),
      updatedAt: new Date(),
    };
    this.items.set(item.id, updated);
    this.auditEvents.push("LIBRARY_ITEM_UPDATED");
    return updated;
  }

  async archiveItem(input: Parameters<LibraryStore["archiveItem"]>[0]) {
    const item = this.items.get(input.itemId);
    if (!item || !this.belongs(item.id, input.schoolId) || item.archivedAt) return false;
    if (this.hasActiveCirculation(input.schoolId, input.itemId)) {
      throw error("ITEM_HAS_ACTIVE_CIRCULATION", "Active circulation prevents archiving.");
    }
    const archivedAt = new Date();
    this.items.set(item.id, { ...item, archivedAt, updatedAt: archivedAt });
    for (const copy of this.copies.values()) {
      if (copy.itemId === item.id && this.belongs(copy.id, input.schoolId) && !copy.archivedAt) {
        this.copies.set(copy.id, { ...copy, archivedAt, updatedAt: archivedAt });
      }
    }
    this.auditEvents.push("LIBRARY_ITEM_ARCHIVED");
    return true;
  }

  async listCopies(
    schoolId: string,
    itemId: string,
    query: Parameters<LibraryStore["listCopies"]>[2],
  ) {
    if (!this.items.has(itemId) || !this.belongs(itemId, schoolId)) return null;
    const records = [...this.copies.values()].filter(
      (record) =>
        this.belongs(record.id, schoolId) &&
        record.itemId === itemId &&
        (query.includeArchived || record.archivedAt === null),
    );
    return page(records, query);
  }

  async createCopy(input: Parameters<LibraryStore["createCopy"]>[0]) {
    const item = this.items.get(input.itemId);
    if (!item || !this.belongs(item.id, input.schoolId) || item.archivedAt) {
      throw error("NOT_FOUND", "Library item not found.");
    }
    const now = new Date();
    const copy: LibraryCopyRecord = {
      id: randomUUID(),
      itemId: item.id,
      archivedAt: null,
      createdAt: now,
      updatedAt: now,
    };
    this.store(copy.id, input.schoolId, this.copies, copy);
    this.auditEvents.push("LIBRARY_COPY_CREATED");
    return copy;
  }

  async archiveCopy(input: Parameters<LibraryStore["archiveCopy"]>[0]) {
    const copy = this.copies.get(input.copyId);
    if (
      !copy ||
      !this.belongs(copy.id, input.schoolId) ||
      copy.itemId !== input.itemId ||
      copy.archivedAt
    ) {
      return false;
    }
    if (this.hasActiveCirculation(input.schoolId, input.itemId)) {
      throw error("ITEM_HAS_ACTIVE_CIRCULATION", "Active circulation prevents archiving.");
    }
    this.copies.set(copy.id, { ...copy, archivedAt: new Date(), updatedAt: new Date() });
    this.auditEvents.push("LIBRARY_COPY_ARCHIVED");
    return true;
  }

  async getPolicy(schoolId: string) {
    return this.policies.get(schoolId) ?? null;
  }

  async setPolicy(input: Parameters<LibraryStore["setPolicy"]>[0]) {
    if (
      !isRepresentableDayOffset(input.loanPeriodDays) ||
      !isRepresentableDayOffset(input.reservationHoldDays)
    ) {
      throw error(
        "INVALID_POLICY_VALUE",
        "The configured day duration is outside the supported date range.",
      );
    }
    const record: LibraryPolicyRecord = {
      loanPeriodDays: input.loanPeriodDays,
      maxActiveLoans: input.maxActiveLoans,
      maxRenewals: input.maxRenewals,
      reservationHoldDays: input.reservationHoldDays,
      updatedAt: new Date(),
    };
    this.policies.set(input.schoolId, record);
    this.auditEvents.push("LIBRARY_POLICY_UPDATED");
    return record;
  }

  async listLoans(schoolId: string, query: Parameters<LibraryStore["listLoans"]>[1]) {
    const records = [...this.loans.values()].filter(
      (record) =>
        this.belongs(record.id, schoolId) &&
        (!query.itemId || record.itemId === query.itemId) &&
        (!query.studentId || record.studentId === query.studentId) &&
        (!query.staffId || record.staffId === query.staffId) &&
        (query.status !== "ACTIVE" || record.returnedAt === null) &&
        (query.status !== "RETURNED" || record.returnedAt !== null),
    );
    return page(records, query);
  }

  async checkout(input: Parameters<LibraryStore["checkout"]>[0]) {
    const borrower = this.validateBorrower(input.schoolId, input.studentId, input.staffId);
    const policy = this.requirePolicy(input.schoolId);
    const copy = this.copies.get(input.copyId);
    if (
      !copy ||
      !this.belongs(copy.id, input.schoolId) ||
      copy.archivedAt ||
      this.items.get(copy.itemId)?.archivedAt
    ) {
      throw error("NOT_FOUND", "Available library copy not found.");
    }
    this.reconcile(input.schoolId, copy.itemId, policy, new Date());
    const ready = [...this.reservations.values()].find(
      (reservation) =>
        this.belongs(reservation.id, input.schoolId) &&
        reservation.status === "READY" &&
        reservation.copyId === copy.id,
    );
    if (ready && (ready.studentId !== borrower.studentId || ready.staffId !== borrower.staffId)) {
      throw error("COPY_RESERVED", "The copy is reserved for another borrower.");
    }
    if (
      [...this.loans.values()].some(
        (loan) =>
          this.belongs(loan.id, input.schoolId) &&
          loan.copyId === copy.id &&
          loan.returnedAt === null,
      )
    ) {
      throw error("COPY_UNAVAILABLE", "The copy is already on loan.");
    }
    const activeCount = [...this.loans.values()].filter(
      (loan) =>
        this.belongs(loan.id, input.schoolId) &&
        loan.returnedAt === null &&
        (borrower.studentId
          ? loan.studentId === borrower.studentId
          : loan.staffId === borrower.staffId),
    ).length;
    if (activeCount >= policy.maxActiveLoans) {
      throw error("MAX_ACTIVE_LOANS", "The borrower has reached the active-loan limit.");
    }
    const now = new Date();
    const loan: LibraryLoanRecord = {
      id: randomUUID(),
      itemId: copy.itemId,
      copyId: copy.id,
      ...borrower,
      checkedOutAt: now,
      dueOn: addCalendarDaysUTC(now, policy.loanPeriodDays),
      returnedAt: null,
      renewalCount: 0,
    };
    this.store(loan.id, input.schoolId, this.loans, loan);
    if (ready) {
      this.reservations.set(ready.id, {
        ...ready,
        status: "FULFILLED",
        completedAt: now,
      });
    }
    this.auditEvents.push("LIBRARY_LOAN_CHECKED_OUT");
    return loan;
  }

  async returnLoan(input: Parameters<LibraryStore["returnLoan"]>[0]) {
    const loan = this.loans.get(input.loanId);
    if (!loan || !this.belongs(loan.id, input.schoolId) || loan.returnedAt) return null;
    const returned = { ...loan, returnedAt: new Date() };
    this.loans.set(loan.id, returned);
    this.reconcile(input.schoolId, loan.itemId, this.requirePolicy(input.schoolId), new Date());
    this.auditEvents.push("LIBRARY_LOAN_RETURNED");
    return returned;
  }

  async renewLoan(input: Parameters<LibraryStore["renewLoan"]>[0]) {
    const loan = this.loans.get(input.loanId);
    if (!loan || !this.belongs(loan.id, input.schoolId) || loan.returnedAt) return null;
    const policy = this.requirePolicy(input.schoolId);
    if (loan.renewalCount >= policy.maxRenewals) {
      throw error("RENEWAL_LIMIT_REACHED", "The loan has reached its renewal limit.");
    }
    const updated = {
      ...loan,
      dueOn: addCalendarDaysUTC(loan.dueOn, policy.loanPeriodDays),
      renewalCount: loan.renewalCount + 1,
    };
    this.loans.set(loan.id, updated);
    this.auditEvents.push("LIBRARY_LOAN_RENEWED");
    return updated;
  }

  async listReservations(schoolId: string, query: Parameters<LibraryStore["listReservations"]>[1]) {
    const now = new Date();
    const records = [...this.reservations.values()].filter(
      (record) =>
        this.belongs(record.id, schoolId) &&
        (!query.itemId || record.itemId === query.itemId) &&
        (!query.studentId || record.studentId === query.studentId) &&
        (!query.staffId || record.staffId === query.staffId) &&
        (!query.status || effectiveReservationStatus(record, now) === query.status),
    );
    return page(records, query);
  }

  async createReservation(input: Parameters<LibraryStore["createReservation"]>[0]) {
    const borrower = this.validateBorrower(input.schoolId, input.studentId, input.staffId);
    const policy = this.requirePolicy(input.schoolId);
    const item = this.items.get(input.itemId);
    if (!item || !this.belongs(item.id, input.schoolId) || item.archivedAt) {
      throw error("NOT_FOUND", "Library item not found.");
    }
    const now = new Date();
    this.reconcile(input.schoolId, item.id, policy, now);
    if (
      [...this.reservations.values()].some(
        (reservation) =>
          this.belongs(reservation.id, input.schoolId) &&
          reservation.itemId === item.id &&
          ["QUEUED", "READY"].includes(reservation.status) &&
          (borrower.studentId
            ? reservation.studentId === borrower.studentId
            : reservation.staffId === borrower.staffId),
      )
    ) {
      throw error("DUPLICATE", "The borrower already has an active reservation.");
    }
    const reservation: LibraryReservationRecord = {
      id: randomUUID(),
      itemId: item.id,
      copyId: null,
      ...borrower,
      status: "QUEUED",
      readyAt: null,
      expiresAt: null,
      completedAt: null,
      createdAt: now,
    };
    this.store(reservation.id, input.schoolId, this.reservations, reservation);
    this.reconcile(input.schoolId, item.id, policy, now);
    this.auditEvents.push("LIBRARY_RESERVATION_CREATED");
    return this.reservations.get(reservation.id) ?? reservation;
  }

  async cancelReservation(input: Parameters<LibraryStore["cancelReservation"]>[0]) {
    const reservation = this.reservations.get(input.reservationId);
    if (reservation && this.belongs(reservation.id, input.schoolId)) {
      this.reconcile(
        input.schoolId,
        reservation.itemId,
        this.requirePolicy(input.schoolId),
        new Date(),
      );
    }
    const current = this.reservations.get(input.reservationId);
    if (
      !current ||
      !this.belongs(current.id, input.schoolId) ||
      !["QUEUED", "READY"].includes(current.status)
    ) {
      return null;
    }
    const now = new Date();
    const cancelled = { ...current, status: "CANCELLED" as const, completedAt: now };
    this.reservations.set(current.id, cancelled);
    this.reconcile(input.schoolId, current.itemId, this.requirePolicy(input.schoolId), now);
    this.auditEvents.push("LIBRARY_RESERVATION_CANCELLED");
    return cancelled;
  }

  async loanReport(schoolId: string, from: string, to: string): Promise<LibraryLoanReport> {
    const start = new Date(`${from}T00:00:00.000Z`);
    const end = new Date(`${to}T23:59:59.999Z`);
    const matching = [...this.loans.values()].filter(
      (loan) =>
        this.belongs(loan.id, schoolId) && loan.checkedOutAt >= start && loan.checkedOutAt <= end,
    );
    const today = new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00.000Z`);
    return {
      checkedOut: matching.length,
      active: matching.filter((loan) => loan.returnedAt === null).length,
      returned: matching.filter((loan) => loan.returnedAt !== null).length,
      overdue: matching.filter((loan) => loan.returnedAt === null && loan.dueOn < today).length,
    };
  }

  private validateBorrower(schoolId: string, studentId?: string, staffId?: string) {
    if (Boolean(studentId) === Boolean(staffId)) {
      throw error("INVALID_RELATIONSHIP", "Select exactly one student or staff borrower.");
    }
    if (studentId && !this.activeStudents.get(schoolId)?.has(studentId)) {
      throw error("NOT_FOUND", "Active student not found.");
    }
    if (staffId && !this.activeStaff.get(schoolId)?.has(staffId)) {
      throw error("NOT_FOUND", "Active staff member not found.");
    }
    return { studentId: studentId ?? null, staffId: staffId ?? null };
  }

  private requirePolicy(schoolId: string) {
    const policy = this.policies.get(schoolId);
    if (!policy) {
      throw error("POLICY_NOT_CONFIGURED", "Configure the library policy before circulation.");
    }
    return policy;
  }

  private reconcile(schoolId: string, itemId: string, policy: LibraryPolicyRecord, now: Date) {
    for (const [id, reservation] of this.reservations) {
      if (
        this.belongs(id, schoolId) &&
        reservation.itemId === itemId &&
        reservation.status === "READY" &&
        reservation.expiresAt &&
        reservation.expiresAt <= now
      ) {
        this.reservations.set(id, {
          ...reservation,
          status: "EXPIRED",
          completedAt: now,
        });
      }
    }
    const available = [...this.copies.values()]
      .filter(
        (copy) =>
          copy.itemId === itemId &&
          this.belongs(copy.id, schoolId) &&
          copy.archivedAt === null &&
          ![...this.loans.values()].some(
            (loan) =>
              this.belongs(loan.id, schoolId) &&
              loan.copyId === copy.id &&
              loan.returnedAt === null,
          ) &&
          ![...this.reservations.values()].some(
            (reservation) =>
              this.belongs(reservation.id, schoolId) &&
              reservation.copyId === copy.id &&
              reservation.status === "READY",
          ),
      )
      .sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime());
    const waiting = [...this.reservations.values()]
      .filter(
        (reservation) =>
          this.belongs(reservation.id, schoolId) &&
          reservation.itemId === itemId &&
          reservation.status === "QUEUED",
      )
      .sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime());
    const expiresAt = new Date(now.getTime() + policy.reservationHoldDays * 86_400_000);
    for (let index = 0; index < Math.min(available.length, waiting.length); index += 1) {
      const copy = available[index];
      const reservation = waiting[index];
      if (!copy || !reservation) continue;
      this.reservations.set(reservation.id, {
        ...reservation,
        status: "READY",
        copyId: copy.id,
        readyAt: now,
        expiresAt,
      });
    }
  }

  private hasActiveCategory(schoolId: string, categoryId: string) {
    const category = this.categories.get(categoryId);
    return Boolean(category && this.belongs(category.id, schoolId) && category.archivedAt === null);
  }

  private hasActiveCirculation(schoolId: string, itemId: string) {
    return (
      [...this.loans.values()].some(
        (loan) =>
          this.belongs(loan.id, schoolId) && loan.itemId === itemId && loan.returnedAt === null,
      ) ||
      [...this.reservations.values()].some(
        (reservation) =>
          this.belongs(reservation.id, schoolId) &&
          reservation.itemId === itemId &&
          ["QUEUED", "READY"].includes(reservation.status),
      )
    );
  }

  private belongs(id: string, schoolId: string) {
    return this.recordSchools.get(id) === schoolId;
  }

  private store<T>(id: string, schoolId: string, target: Map<string, T>, value: T) {
    this.recordSchools.set(id, schoolId);
    target.set(id, value);
  }
}

function page<T>(items: T[], query: { offset: number; limit: number }): LibraryPage<T> {
  return {
    items: items.slice(query.offset, query.offset + query.limit),
    total: items.length,
  };
}

function addCalendarDaysUTC(value: Date, days: number): Date {
  const date = new Date(value);
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCDate(date.getUTCDate() + days);
  if (!Number.isFinite(date.getTime())) {
    throw error(
      "INVALID_POLICY_VALUE",
      "The configured day duration is outside the supported date range.",
    );
  }
  return date;
}

function effectiveReservationStatus(
  record: LibraryReservationRecord,
  now: Date,
): LibraryReservationRecord["status"] {
  return record.status === "READY" && record.expiresAt && record.expiresAt <= now
    ? "EXPIRED"
    : record.status;
}

function isRepresentableDayOffset(days: number): boolean {
  const date = new Date();
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCDate(date.getUTCDate() + days);
  return Number.isFinite(date.getTime());
}

function error(code: ConstructorParameters<typeof LibraryStoreError>[0], message: string) {
  return new LibraryStoreError(code, message);
}
