export type LibraryReservationStatus = "QUEUED" | "READY" | "FULFILLED" | "CANCELLED" | "EXPIRED";
export type LibraryLoanFilter = "ACTIVE" | "RETURNED" | "ALL";
export type LibraryPageQuery = { limit: number; offset: number };
export type LibraryPage<T> = { items: T[]; total: number };
export type LibraryContext = {
  schoolId: string;
  actorUserId: string;
  requestId: string;
};

export type LibraryCategoryRecord = {
  id: string;
  name: string;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type LibraryItemRecord = {
  id: string;
  title: string;
  author: string | null;
  isbn: string | null;
  categoryId: string | null;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type LibraryCopyRecord = {
  id: string;
  itemId: string;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type LibraryPolicyRecord = {
  loanPeriodDays: number;
  maxActiveLoans: number;
  maxRenewals: number;
  reservationHoldDays: number;
  updatedAt: Date;
};

export type LibraryLoanRecord = {
  id: string;
  itemId: string;
  copyId: string;
  studentId: string | null;
  staffId: string | null;
  checkedOutAt: Date;
  dueOn: Date;
  returnedAt: Date | null;
  renewalCount: number;
};

export type LibraryReservationRecord = {
  id: string;
  itemId: string;
  copyId: string | null;
  studentId: string | null;
  staffId: string | null;
  status: LibraryReservationStatus;
  readyAt: Date | null;
  expiresAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
};

export type LibraryLoanReport = {
  checkedOut: number;
  active: number;
  returned: number;
  overdue: number;
};

export type CreateLibraryItemInput = LibraryContext & {
  title: string;
  author?: string | null;
  isbn?: string | null;
  categoryId?: string | null;
};

export type UpdateLibraryItemInput = LibraryContext & {
  itemId: string;
  title?: string;
  author?: string | null;
  isbn?: string | null;
  categoryId?: string | null;
};

export type LibraryBorrowerInput = {
  studentId?: string;
  staffId?: string;
};

export type LibraryStoreErrorCode =
  | "NOT_FOUND"
  | "SCHOOL_NOT_FOUND"
  | "DUPLICATE"
  | "INVALID_RELATIONSHIP"
  | "INVALID_POLICY_VALUE"
  | "POLICY_NOT_CONFIGURED"
  | "COPY_UNAVAILABLE"
  | "COPY_RESERVED"
  | "MAX_ACTIVE_LOANS"
  | "RENEWAL_LIMIT_REACHED"
  | "ITEM_HAS_ACTIVE_CIRCULATION";

export class LibraryStoreError extends Error {
  constructor(
    readonly code: LibraryStoreErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "LibraryStoreError";
  }
}

export interface LibraryStore {
  listCategories(
    schoolId: string,
    query: LibraryPageQuery & { includeArchived?: boolean },
  ): Promise<LibraryPage<LibraryCategoryRecord>>;
  createCategory(input: LibraryContext & { name: string }): Promise<LibraryCategoryRecord>;
  archiveCategory(input: LibraryContext & { categoryId: string }): Promise<boolean>;
  listItems(
    schoolId: string,
    query: LibraryPageQuery & {
      categoryId?: string;
      search?: string;
      includeArchived?: boolean;
    },
  ): Promise<LibraryPage<LibraryItemRecord>>;
  getItem(schoolId: string, itemId: string): Promise<LibraryItemRecord | null>;
  createItem(input: CreateLibraryItemInput): Promise<LibraryItemRecord>;
  updateItem(input: UpdateLibraryItemInput): Promise<LibraryItemRecord | null>;
  archiveItem(input: LibraryContext & { itemId: string }): Promise<boolean>;
  listCopies(
    schoolId: string,
    itemId: string,
    query: LibraryPageQuery & { includeArchived?: boolean },
  ): Promise<LibraryPage<LibraryCopyRecord> | null>;
  createCopy(input: LibraryContext & { itemId: string }): Promise<LibraryCopyRecord>;
  archiveCopy(input: LibraryContext & { itemId: string; copyId: string }): Promise<boolean>;
  getPolicy(schoolId: string): Promise<LibraryPolicyRecord | null>;
  setPolicy(
    input: LibraryContext & Omit<LibraryPolicyRecord, "updatedAt">,
  ): Promise<LibraryPolicyRecord>;
  listLoans(
    schoolId: string,
    query: LibraryPageQuery & {
      itemId?: string;
      studentId?: string;
      staffId?: string;
      status?: LibraryLoanFilter;
    },
  ): Promise<LibraryPage<LibraryLoanRecord>>;
  checkout(
    input: LibraryContext & { copyId: string } & LibraryBorrowerInput,
  ): Promise<LibraryLoanRecord>;
  returnLoan(input: LibraryContext & { loanId: string }): Promise<LibraryLoanRecord | null>;
  renewLoan(input: LibraryContext & { loanId: string }): Promise<LibraryLoanRecord | null>;
  listReservations(
    schoolId: string,
    query: LibraryPageQuery & {
      itemId?: string;
      studentId?: string;
      staffId?: string;
      status?: LibraryReservationStatus;
    },
  ): Promise<LibraryPage<LibraryReservationRecord>>;
  createReservation(
    input: LibraryContext & { itemId: string } & LibraryBorrowerInput,
  ): Promise<LibraryReservationRecord>;
  cancelReservation(
    input: LibraryContext & { reservationId: string },
  ): Promise<LibraryReservationRecord | null>;
  loanReport(schoolId: string, from: string, to: string): Promise<LibraryLoanReport>;
}
