import { type TransactionTimeoutOptions, resolveTransactionOptions } from "./transaction-options.js";
import {
  Prisma,
  type PrismaClient,
  LibraryReservationStatus as ReservationStatus,
  SchoolStatus,
  StaffStatus,
  StudentStatus,
} from "@prisma/client";
import type {
  CreateLibraryItemInput,
  LibraryCategoryRecord,
  LibraryContext,
  LibraryCopyRecord,
  LibraryItemRecord,
  LibraryLoanRecord,
  LibraryLoanReport,
  LibraryPage,
  LibraryPageQuery,
  LibraryPolicyRecord,
  LibraryReservationRecord,
  LibraryStore,
  UpdateLibraryItemInput,
} from "./library-contracts.js";
import { LibraryStoreError } from "./library-contracts.js";

export class PrismaLibraryStore implements LibraryStore {
  private readonly txOptions: { maxWait: number; timeout: number };

  constructor(
    private readonly prisma: PrismaClient,
    options?: TransactionTimeoutOptions,
  ) {
    this.txOptions = resolveTransactionOptions(options);
  }

  async listCategories(
    schoolId: string,
    query: LibraryPageQuery & { includeArchived?: boolean },
  ): Promise<LibraryPage<LibraryCategoryRecord>> {
    const where: Prisma.LibraryCategoryWhereInput = {
      schoolId,
      ...(query.includeArchived ? {} : { archivedAt: null }),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.libraryCategory.findMany({
        where,
        select: categorySelect,
        orderBy: [{ name: "asc" }, { id: "asc" }],
        skip: query.offset,
        take: query.limit,
      }),
      this.prisma.libraryCategory.count({ where }),
    ]);
    return { items, total };
  }

  createCategory(input: LibraryContext & { name: string }): Promise<LibraryCategoryRecord> {
    return this.transaction(async (tx) => {
      await lockSchool(tx, input.schoolId);
      await requireActiveSchool(tx, input.schoolId);
      const category = await tx.libraryCategory.create({
        data: {
          schoolId: input.schoolId,
          name: input.name,
          nameKey: normalizeName(input.name),
        },
        select: categorySelect,
      });
      await audit(tx, input, "LIBRARY_CATEGORY_CREATED", category.id);
      return category;
    });
  }

  async archiveCategory(input: LibraryContext & { categoryId: string }): Promise<boolean> {
    return this.transaction(async (tx) => {
      await lockSchool(tx, input.schoolId);
      await requireActiveSchool(tx, input.schoolId);
      const changed = await tx.libraryCategory.updateMany({
        where: { schoolId: input.schoolId, id: input.categoryId, archivedAt: null },
        data: { archivedAt: new Date() },
      });
      if (changed.count !== 1) return false;
      await audit(tx, input, "LIBRARY_CATEGORY_ARCHIVED", input.categoryId);
      return true;
    });
  }

  async listItems(
    schoolId: string,
    query: LibraryPageQuery & {
      categoryId?: string;
      search?: string;
      includeArchived?: boolean;
    },
  ): Promise<LibraryPage<LibraryItemRecord>> {
    const where: Prisma.LibraryItemWhereInput = {
      schoolId,
      ...(query.includeArchived ? {} : { archivedAt: null }),
      ...(query.categoryId ? { categoryId: query.categoryId } : {}),
      ...(query.search ? { title: { contains: query.search, mode: "insensitive" } } : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.libraryItem.findMany({
        where,
        select: itemSelect,
        orderBy: [{ title: "asc" }, { id: "asc" }],
        skip: query.offset,
        take: query.limit,
      }),
      this.prisma.libraryItem.count({ where }),
    ]);
    return { items, total };
  }

  getItem(schoolId: string, itemId: string): Promise<LibraryItemRecord | null> {
    return this.prisma.libraryItem.findFirst({
      where: { schoolId, id: itemId },
      select: itemSelect,
    });
  }

  createItem(input: CreateLibraryItemInput): Promise<LibraryItemRecord> {
    return this.transaction(async (tx) => {
      await lockSchool(tx, input.schoolId);
      await requireActiveSchool(tx, input.schoolId);
      if (input.categoryId) {
        await requireActiveCategory(tx, input.schoolId, input.categoryId);
      }
      const item = await tx.libraryItem.create({
        data: {
          schoolId: input.schoolId,
          title: input.title,
          author: input.author ?? null,
          isbn: input.isbn ?? null,
          categoryId: input.categoryId ?? null,
        },
        select: itemSelect,
      });
      await audit(tx, input, "LIBRARY_ITEM_CREATED", item.id);
      return item;
    });
  }

  async updateItem(input: UpdateLibraryItemInput): Promise<LibraryItemRecord | null> {
    return this.transaction(async (tx) => {
      await lockSchool(tx, input.schoolId);
      await requireActiveSchool(tx, input.schoolId);
      const existing = await tx.libraryItem.findFirst({
        where: { schoolId: input.schoolId, id: input.itemId, archivedAt: null },
        select: { id: true },
      });
      if (!existing) return null;
      if (input.categoryId) {
        await requireActiveCategory(tx, input.schoolId, input.categoryId);
      }
      const item = await tx.libraryItem.update({
        where: { id: input.itemId },
        data: {
          ...(input.title !== undefined ? { title: input.title } : {}),
          ...(input.author !== undefined ? { author: input.author } : {}),
          ...(input.isbn !== undefined ? { isbn: input.isbn } : {}),
          ...(input.categoryId !== undefined ? { categoryId: input.categoryId } : {}),
        },
        select: itemSelect,
      });
      await audit(tx, input, "LIBRARY_ITEM_UPDATED", item.id);
      return item;
    });
  }

  async archiveItem(input: LibraryContext & { itemId: string }): Promise<boolean> {
    return this.transaction(async (tx) => {
      await lockSchool(tx, input.schoolId);
      await requireActiveSchool(tx, input.schoolId);
      const item = await tx.libraryItem.findFirst({
        where: { schoolId: input.schoolId, id: input.itemId, archivedAt: null },
        select: { id: true },
      });
      if (!item) return false;
      await reconcileIfConfigured(tx, input, input.itemId, new Date());
      await ensureNoActiveCirculation(tx, input.schoolId, input.itemId);
      const archivedAt = new Date();
      await tx.libraryItem.update({
        where: { id: item.id },
        data: { archivedAt },
      });
      await tx.libraryCopy.updateMany({
        where: { schoolId: input.schoolId, itemId: input.itemId, archivedAt: null },
        data: { archivedAt },
      });
      await audit(tx, input, "LIBRARY_ITEM_ARCHIVED", input.itemId);
      return true;
    });
  }

  async listCopies(
    schoolId: string,
    itemId: string,
    query: LibraryPageQuery & { includeArchived?: boolean },
  ): Promise<LibraryPage<LibraryCopyRecord> | null> {
    const item = await this.prisma.libraryItem.findFirst({
      where: { schoolId, id: itemId },
      select: { id: true },
    });
    if (!item) return null;
    const where: Prisma.LibraryCopyWhereInput = {
      schoolId,
      itemId,
      ...(query.includeArchived ? {} : { archivedAt: null }),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.libraryCopy.findMany({
        where,
        select: copySelect,
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        skip: query.offset,
        take: query.limit,
      }),
      this.prisma.libraryCopy.count({ where }),
    ]);
    return { items, total };
  }

  createCopy(input: LibraryContext & { itemId: string }): Promise<LibraryCopyRecord> {
    return this.transaction(async (tx) => {
      await lockSchool(tx, input.schoolId);
      await requireActiveSchool(tx, input.schoolId);
      const item = await tx.libraryItem.findFirst({
        where: { schoolId: input.schoolId, id: input.itemId, archivedAt: null },
        select: { id: true },
      });
      if (!item) throw notFound("library item");
      const copy = await tx.libraryCopy.create({
        data: { schoolId: input.schoolId, itemId: input.itemId },
        select: copySelect,
      });
      await audit(tx, input, "LIBRARY_COPY_CREATED", copy.id);
      return copy;
    });
  }

  async archiveCopy(input: LibraryContext & { itemId: string; copyId: string }): Promise<boolean> {
    return this.transaction(async (tx) => {
      await lockSchool(tx, input.schoolId);
      await requireActiveSchool(tx, input.schoolId);
      const copy = await tx.libraryCopy.findFirst({
        where: {
          schoolId: input.schoolId,
          itemId: input.itemId,
          id: input.copyId,
          archivedAt: null,
        },
        select: { id: true },
      });
      if (!copy) return false;
      await reconcileIfConfigured(tx, input, input.itemId, new Date());
      await ensureNoActiveCirculation(tx, input.schoolId, input.itemId);
      const changed = await tx.libraryCopy.updateMany({
        where: {
          schoolId: input.schoolId,
          itemId: input.itemId,
          id: input.copyId,
          archivedAt: null,
        },
        data: { archivedAt: new Date() },
      });
      if (changed.count !== 1) return false;
      await audit(tx, input, "LIBRARY_COPY_ARCHIVED", input.copyId);
      return true;
    });
  }

  getPolicy(schoolId: string): Promise<LibraryPolicyRecord | null> {
    return this.prisma.libraryPolicy.findUnique({
      where: { schoolId },
      select: policySelect,
    });
  }

  setPolicy(
    input: LibraryContext & Omit<LibraryPolicyRecord, "updatedAt">,
  ): Promise<LibraryPolicyRecord> {
    if (
      !isRepresentableDayOffset(input.loanPeriodDays) ||
      !isRepresentableDayOffset(input.reservationHoldDays)
    ) {
      throw storeError(
        "INVALID_POLICY_VALUE",
        "The configured day duration is outside the supported date range.",
      );
    }
    return this.transaction(async (tx) => {
      await lockSchool(tx, input.schoolId);
      await requireActiveSchool(tx, input.schoolId);
      const previous = await tx.libraryPolicy.findUnique({
        where: { schoolId: input.schoolId },
        select: policySelect,
      });
      const policy = await tx.libraryPolicy.upsert({
        where: { schoolId: input.schoolId },
        create: {
          schoolId: input.schoolId,
          loanPeriodDays: input.loanPeriodDays,
          maxActiveLoans: input.maxActiveLoans,
          maxRenewals: input.maxRenewals,
          reservationHoldDays: input.reservationHoldDays,
          updatedByUserId: input.actorUserId,
        },
        update: {
          loanPeriodDays: input.loanPeriodDays,
          maxActiveLoans: input.maxActiveLoans,
          maxRenewals: input.maxRenewals,
          reservationHoldDays: input.reservationHoldDays,
          updatedByUserId: input.actorUserId,
        },
        select: policySelect,
      });
      await audit(tx, input, "LIBRARY_POLICY_UPDATED", input.schoolId, {
        previousLoanPeriodDays: previous?.loanPeriodDays ?? null,
        previousMaxActiveLoans: previous?.maxActiveLoans ?? null,
        previousMaxRenewals: previous?.maxRenewals ?? null,
        previousReservationHoldDays: previous?.reservationHoldDays ?? null,
        loanPeriodDays: policy.loanPeriodDays,
        maxActiveLoans: policy.maxActiveLoans,
        maxRenewals: policy.maxRenewals,
        reservationHoldDays: policy.reservationHoldDays,
      });
      return policy;
    });
  }

  async listLoans(
    schoolId: string,
    query: LibraryPageQuery & {
      itemId?: string;
      studentId?: string;
      staffId?: string;
      status?: "ACTIVE" | "RETURNED" | "ALL";
    },
  ): Promise<LibraryPage<LibraryLoanRecord>> {
    const where: Prisma.LibraryLoanWhereInput = {
      schoolId,
      ...(query.itemId ? { itemId: query.itemId } : {}),
      ...(query.studentId ? { studentId: query.studentId } : {}),
      ...(query.staffId ? { staffId: query.staffId } : {}),
      ...(query.status === "ACTIVE"
        ? { returnedAt: null }
        : query.status === "RETURNED"
          ? { returnedAt: { not: null } }
          : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.libraryLoan.findMany({
        where,
        select: loanSelect,
        orderBy: [{ checkedOutAt: "desc" }, { id: "desc" }],
        skip: query.offset,
        take: query.limit,
      }),
      this.prisma.libraryLoan.count({ where }),
    ]);
    return { items, total };
  }

  checkout(
    input: LibraryContext & { copyId: string; studentId?: string; staffId?: string },
  ): Promise<LibraryLoanRecord> {
    return this.transaction(async (tx) => {
      await lockSchool(tx, input.schoolId);
      await requireActiveSchool(tx, input.schoolId);
      const borrower = await validateBorrower(tx, input);
      const policy = await requirePolicy(tx, input.schoolId);
      const copy = await tx.libraryCopy.findFirst({
        where: {
          schoolId: input.schoolId,
          id: input.copyId,
          archivedAt: null,
          item: { archivedAt: null },
        },
        select: { id: true, itemId: true },
      });
      if (!copy) throw notFound("available library copy");
      const now = new Date();
      await reconcileReservations(tx, input, copy.itemId, policy, now);
      const readyReservation = await tx.libraryReservation.findFirst({
        where: { schoolId: input.schoolId, copyId: copy.id, status: ReservationStatus.READY },
        select: { id: true, studentId: true, staffId: true },
      });
      if (
        readyReservation &&
        (readyReservation.studentId !== borrower.studentId ||
          readyReservation.staffId !== borrower.staffId)
      ) {
        throw storeError("COPY_RESERVED", "The copy is reserved for another borrower.");
      }
      const activeLoan = await tx.libraryLoan.findFirst({
        where: { schoolId: input.schoolId, copyId: copy.id, returnedAt: null },
        select: { id: true },
      });
      if (activeLoan) throw storeError("COPY_UNAVAILABLE", "The copy is already on loan.");
      const activeLoans = await tx.libraryLoan.count({
        where: {
          schoolId: input.schoolId,
          returnedAt: null,
          ...(borrower.studentId
            ? { studentId: borrower.studentId }
            : { staffId: borrower.staffId }),
        },
      });
      if (activeLoans >= policy.maxActiveLoans) {
        throw storeError("MAX_ACTIVE_LOANS", "The borrower has reached the active-loan limit.");
      }
      const dueOn = addCalendarDaysUTC(now, policy.loanPeriodDays);
      const loan = await tx.libraryLoan.create({
        data: {
          schoolId: input.schoolId,
          itemId: copy.itemId,
          copyId: copy.id,
          studentId: borrower.studentId,
          staffId: borrower.staffId,
          checkedOutAt: now,
          dueOn,
        },
        select: loanSelect,
      });
      if (readyReservation) {
        await tx.libraryReservation.update({
          where: { id: readyReservation.id },
          data: { status: ReservationStatus.FULFILLED, completedAt: now },
        });
        await audit(tx, input, "LIBRARY_RESERVATION_FULFILLED", readyReservation.id, {
          loanId: loan.id,
        });
      }
      await audit(tx, input, "LIBRARY_LOAN_CHECKED_OUT", loan.id, {
        copyId: loan.copyId,
        dueOn: loan.dueOn.toISOString().slice(0, 10),
      });
      return loan;
    });
  }

  async returnLoan(input: LibraryContext & { loanId: string }): Promise<LibraryLoanRecord | null> {
    return this.transaction(async (tx) => {
      await lockSchool(tx, input.schoolId);
      await requireActiveSchool(tx, input.schoolId);
      const loan = await tx.libraryLoan.findFirst({
        where: { schoolId: input.schoolId, id: input.loanId, returnedAt: null },
        select: { id: true, itemId: true },
      });
      if (!loan) return null;
      const now = new Date();
      const policy = await requirePolicy(tx, input.schoolId);
      const returned = await tx.libraryLoan.update({
        where: { id: loan.id },
        data: { returnedAt: now },
        select: loanSelect,
      });
      await reconcileReservations(tx, input, loan.itemId, policy, now);
      await audit(tx, input, "LIBRARY_LOAN_RETURNED", loan.id, {
        returnedAt: returned.returnedAt?.toISOString() ?? null,
      });
      return returned;
    });
  }

  async renewLoan(input: LibraryContext & { loanId: string }): Promise<LibraryLoanRecord | null> {
    return this.transaction(async (tx) => {
      await lockSchool(tx, input.schoolId);
      await requireActiveSchool(tx, input.schoolId);
      const loan = await tx.libraryLoan.findFirst({
        where: { schoolId: input.schoolId, id: input.loanId, returnedAt: null },
        select: loanSelect,
      });
      if (!loan) return null;
      const policy = await requirePolicy(tx, input.schoolId);
      if (loan.renewalCount >= policy.maxRenewals) {
        throw storeError("RENEWAL_LIMIT_REACHED", "The loan has reached its renewal limit.");
      }
      const updated = await tx.libraryLoan.update({
        where: { id: loan.id },
        data: {
          dueOn: addCalendarDaysUTC(loan.dueOn, policy.loanPeriodDays),
          renewalCount: { increment: 1 },
        },
        select: loanSelect,
      });
      await audit(tx, input, "LIBRARY_LOAN_RENEWED", loan.id, {
        previousDueOn: loan.dueOn.toISOString().slice(0, 10),
        dueOn: updated.dueOn.toISOString().slice(0, 10),
        renewalCount: updated.renewalCount,
      });
      return updated;
    });
  }

  async listReservations(
    schoolId: string,
    query: LibraryPageQuery & {
      itemId?: string;
      studentId?: string;
      staffId?: string;
      status?: "QUEUED" | "READY" | "FULFILLED" | "CANCELLED" | "EXPIRED";
    },
  ): Promise<LibraryPage<LibraryReservationRecord>> {
    const now = new Date();
    const statusFilter: Prisma.LibraryReservationWhereInput =
      query.status === "EXPIRED"
        ? {
            OR: [
              { status: ReservationStatus.EXPIRED },
              { status: ReservationStatus.READY, expiresAt: { lte: now } },
            ],
          }
        : query.status === "READY"
          ? { status: ReservationStatus.READY, expiresAt: { gt: now } }
          : query.status
            ? { status: query.status }
            : {};
    const where: Prisma.LibraryReservationWhereInput = {
      schoolId,
      ...(query.itemId ? { itemId: query.itemId } : {}),
      ...(query.studentId ? { studentId: query.studentId } : {}),
      ...(query.staffId ? { staffId: query.staffId } : {}),
      ...statusFilter,
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.libraryReservation.findMany({
        where,
        select: reservationSelect,
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        skip: query.offset,
        take: query.limit,
      }),
      this.prisma.libraryReservation.count({ where }),
    ]);
    return { items, total };
  }

  createReservation(
    input: LibraryContext & { itemId: string; studentId?: string; staffId?: string },
  ): Promise<LibraryReservationRecord> {
    return this.transaction(async (tx) => {
      await lockSchool(tx, input.schoolId);
      await requireActiveSchool(tx, input.schoolId);
      const borrower = await validateBorrower(tx, input);
      const policy = await requirePolicy(tx, input.schoolId);
      const item = await tx.libraryItem.findFirst({
        where: { schoolId: input.schoolId, id: input.itemId, archivedAt: null },
        select: { id: true },
      });
      if (!item) throw notFound("library item");
      const now = new Date();
      await reconcileReservations(tx, input, item.id, policy, now);
      const existing = await tx.libraryReservation.findFirst({
        where: {
          schoolId: input.schoolId,
          itemId: item.id,
          status: { in: [ReservationStatus.QUEUED, ReservationStatus.READY] },
          ...(borrower.studentId
            ? { studentId: borrower.studentId }
            : { staffId: borrower.staffId }),
        },
        select: { id: true },
      });
      if (existing)
        throw storeError("DUPLICATE", "The borrower already has an active reservation.");
      const reservation = await tx.libraryReservation.create({
        data: {
          schoolId: input.schoolId,
          itemId: item.id,
          studentId: borrower.studentId,
          staffId: borrower.staffId,
        },
        select: reservationSelect,
      });
      await reconcileReservations(tx, input, item.id, policy, now);
      const updated = await tx.libraryReservation.findUniqueOrThrow({
        where: { id: reservation.id },
        select: reservationSelect,
      });
      await audit(tx, input, "LIBRARY_RESERVATION_CREATED", updated.id);
      return updated;
    });
  }

  async cancelReservation(
    input: LibraryContext & { reservationId: string },
  ): Promise<LibraryReservationRecord | null> {
    return this.transaction(async (tx) => {
      await lockSchool(tx, input.schoolId);
      await requireActiveSchool(tx, input.schoolId);
      const reservation = await tx.libraryReservation.findFirst({
        where: {
          schoolId: input.schoolId,
          id: input.reservationId,
          status: { in: [ReservationStatus.QUEUED, ReservationStatus.READY] },
        },
        select: { id: true, itemId: true },
      });
      if (!reservation) return null;
      const now = new Date();
      const policy = await requirePolicy(tx, input.schoolId);
      await reconcileReservations(tx, input, reservation.itemId, policy, now);
      const active = await tx.libraryReservation.findFirst({
        where: {
          schoolId: input.schoolId,
          id: reservation.id,
          status: { in: [ReservationStatus.QUEUED, ReservationStatus.READY] },
        },
        select: { id: true },
      });
      if (!active) return null;
      const cancelled = await tx.libraryReservation.update({
        where: { id: active.id },
        data: { status: ReservationStatus.CANCELLED, completedAt: now },
        select: reservationSelect,
      });
      await reconcileReservations(tx, input, reservation.itemId, policy, now);
      await audit(tx, input, "LIBRARY_RESERVATION_CANCELLED", reservation.id);
      return cancelled;
    });
  }

  async loanReport(schoolId: string, from: string, to: string): Promise<LibraryLoanReport> {
    const start = parseDate(from);
    const endExclusive = addCalendarDaysUTC(parseDate(to), 1);
    const checkedOutAt = { gte: start, lt: endExclusive };
    const today = parseDate(new Date().toISOString().slice(0, 10));
    const [checkedOut, active, returned, overdue] = await this.prisma.$transaction([
      this.prisma.libraryLoan.count({ where: { schoolId, checkedOutAt } }),
      this.prisma.libraryLoan.count({ where: { schoolId, checkedOutAt, returnedAt: null } }),
      this.prisma.libraryLoan.count({
        where: { schoolId, checkedOutAt, returnedAt: { not: null } },
      }),
      this.prisma.libraryLoan.count({
        where: { schoolId, checkedOutAt, returnedAt: null, dueOn: { lt: today } },
      }),
    ]);
    return { checkedOut, active, returned, overdue };
  }

  private transaction<T>(operation: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    return this.guard(() =>
      this.prisma.$transaction(operation, {
        isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
        maxWait: this.txOptions.maxWait,
        timeout: this.txOptions.timeout,
      }),
    );
  }

  private async guard<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (error instanceof LibraryStoreError) throw error;
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === "P2002") {
          throw storeError("DUPLICATE", "A conflicting library record already exists.");
        }
        if (error.code === "P2003" || error.code === "P2014") {
          throw storeError("INVALID_RELATIONSHIP", "A referenced library record is invalid.");
        }
      }
      throw error;
    }
  }
}

const categorySelect = {
  id: true,
  name: true,
  archivedAt: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.LibraryCategorySelect;

const itemSelect = {
  id: true,
  title: true,
  author: true,
  isbn: true,
  categoryId: true,
  archivedAt: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.LibraryItemSelect;

const copySelect = {
  id: true,
  itemId: true,
  archivedAt: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.LibraryCopySelect;

const policySelect = {
  loanPeriodDays: true,
  maxActiveLoans: true,
  maxRenewals: true,
  reservationHoldDays: true,
  updatedAt: true,
} satisfies Prisma.LibraryPolicySelect;

const loanSelect = {
  id: true,
  itemId: true,
  copyId: true,
  studentId: true,
  staffId: true,
  checkedOutAt: true,
  dueOn: true,
  returnedAt: true,
  renewalCount: true,
} satisfies Prisma.LibraryLoanSelect;

const reservationSelect = {
  id: true,
  itemId: true,
  copyId: true,
  studentId: true,
  staffId: true,
  status: true,
  readyAt: true,
  expiresAt: true,
  completedAt: true,
  createdAt: true,
} satisfies Prisma.LibraryReservationSelect;

async function requireActiveSchool(tx: Prisma.TransactionClient, schoolId: string) {
  const school = await tx.school.findFirst({
    where: { id: schoolId, status: SchoolStatus.ACTIVE },
    select: { id: true },
  });
  if (!school) throw storeError("SCHOOL_NOT_FOUND", "The active school was not found.");
}

async function requireActiveCategory(
  tx: Prisma.TransactionClient,
  schoolId: string,
  categoryId: string,
) {
  const category = await tx.libraryCategory.findFirst({
    where: { schoolId, id: categoryId, archivedAt: null },
    select: { id: true },
  });
  if (!category) throw storeError("INVALID_RELATIONSHIP", "An active category is required.");
}

async function requirePolicy(tx: Prisma.TransactionClient, schoolId: string) {
  const policy = await tx.libraryPolicy.findUnique({
    where: { schoolId },
    select: policySelect,
  });
  if (!policy) {
    throw storeError("POLICY_NOT_CONFIGURED", "Configure the library policy before circulation.");
  }
  return policy;
}

async function reconcileIfConfigured(
  tx: Prisma.TransactionClient,
  input: LibraryContext,
  itemId: string,
  now: Date,
) {
  const policy = await tx.libraryPolicy.findUnique({
    where: { schoolId: input.schoolId },
    select: policySelect,
  });
  if (policy) await reconcileReservations(tx, input, itemId, policy, now);
}

async function validateBorrower(
  tx: Prisma.TransactionClient,
  input: { schoolId: string; studentId?: string; staffId?: string },
) {
  if (Boolean(input.studentId) === Boolean(input.staffId)) {
    throw storeError("INVALID_RELATIONSHIP", "Select exactly one student or staff borrower.");
  }
  if (input.studentId) {
    const student = await tx.student.findFirst({
      where: { schoolId: input.schoolId, id: input.studentId, status: StudentStatus.ACTIVE },
      select: { id: true },
    });
    if (!student) throw notFound("active student");
    return { studentId: student.id, staffId: null };
  }
  const staff = await tx.staff.findFirst({
    where: { schoolId: input.schoolId, id: input.staffId, status: StaffStatus.ACTIVE },
    select: { id: true },
  });
  if (!staff) throw notFound("active staff member");
  return { studentId: null, staffId: staff.id };
}

async function ensureNoActiveCirculation(
  tx: Prisma.TransactionClient,
  schoolId: string,
  itemId: string,
) {
  const [loan, reservation] = await Promise.all([
    tx.libraryLoan.findFirst({
      where: { schoolId, itemId, returnedAt: null },
      select: { id: true },
    }),
    tx.libraryReservation.findFirst({
      where: {
        schoolId,
        itemId,
        status: { in: [ReservationStatus.QUEUED, ReservationStatus.READY] },
      },
      select: { id: true },
    }),
  ]);
  if (loan || reservation) {
    throw storeError(
      "ITEM_HAS_ACTIVE_CIRCULATION",
      "Active loans or reservations prevent archiving.",
    );
  }
}

async function reconcileReservations(
  tx: Prisma.TransactionClient,
  input: LibraryContext,
  itemId: string,
  policy: LibraryPolicyRecord,
  now: Date,
) {
  const expired = await tx.libraryReservation.findMany({
    where: {
      schoolId: input.schoolId,
      itemId,
      status: ReservationStatus.READY,
      expiresAt: { lte: now },
    },
    select: { id: true },
  });
  for (const reservation of expired) {
    await tx.libraryReservation.updateMany({
      where: {
        schoolId: input.schoolId,
        id: reservation.id,
        status: ReservationStatus.READY,
      },
      data: { status: ReservationStatus.EXPIRED, completedAt: now },
    });
    await audit(tx, input, "LIBRARY_RESERVATION_EXPIRED", reservation.id);
  }
  await promoteQueuedReservations(tx, input, itemId, policy, now);
}

async function promoteQueuedReservations(
  tx: Prisma.TransactionClient,
  input: LibraryContext,
  itemId: string,
  policy: LibraryPolicyRecord,
  now: Date,
) {
  const copies = await tx.libraryCopy.findMany({
    where: {
      schoolId: input.schoolId,
      itemId,
      archivedAt: null,
      item: { archivedAt: null },
      loans: { none: { returnedAt: null } },
      reservations: { none: { status: ReservationStatus.READY } },
    },
    select: { id: true },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
  if (copies.length === 0) return;
  const queued = await tx.libraryReservation.findMany({
    where: { schoolId: input.schoolId, itemId, status: ReservationStatus.QUEUED },
    select: { id: true },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    take: copies.length,
  });
  const expiresAt = new Date(now.getTime() + policy.reservationHoldDays * 86_400_000);
  for (const [index, reservation] of queued.entries()) {
    const copy = copies[index];
    if (!copy) break;
    await tx.libraryReservation.update({
      where: { id: reservation.id },
      data: {
        status: ReservationStatus.READY,
        copyId: copy.id,
        readyAt: now,
        expiresAt,
      },
    });
    await audit(tx, input, "LIBRARY_RESERVATION_READIED", reservation.id, {
      copyId: copy.id,
      expiresAt: expiresAt.toISOString(),
    });
  }
}

async function lockSchool(tx: Prisma.TransactionClient, schoolId: string) {
  await tx.$queryRaw`SELECT id FROM schools WHERE id = ${schoolId}::uuid FOR UPDATE`;
}

async function audit(
  tx: Prisma.TransactionClient,
  input: LibraryContext,
  eventType: string,
  resourceId: string,
  details: Record<string, string | number | null> = {},
) {
  await tx.securityAuditEvent.create({
    data: {
      schoolId: input.schoolId,
      actorUserId: input.actorUserId,
      eventType,
      outcome: "SUCCESS",
      requestId: input.requestId,
      metadata: { resourceId, ...details },
    },
  });
}

function addCalendarDaysUTC(value: Date, days: number): Date {
  const date = new Date(value);
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCDate(date.getUTCDate() + days);
  if (!Number.isFinite(date.getTime())) {
    throw storeError(
      "INVALID_POLICY_VALUE",
      "The configured day duration is outside the supported date range.",
    );
  }
  return date;
}

function isRepresentableDayOffset(days: number): boolean {
  const date = new Date();
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCDate(date.getUTCDate() + days);
  return Number.isFinite(date.getTime());
}

function parseDate(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

function normalizeName(value: string): string {
  return value.trim().normalize("NFKC").toLocaleLowerCase("en");
}

function notFound(resource: string): LibraryStoreError {
  return storeError("NOT_FOUND", `The requested ${resource} was not found.`);
}

function storeError(code: ConstructorParameters<typeof LibraryStoreError>[0], message: string) {
  return new LibraryStoreError(code, message);
}
