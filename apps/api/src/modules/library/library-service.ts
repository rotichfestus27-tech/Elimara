import { type LibraryStore, LibraryStoreError } from "@elimara/database";
import { ApiError } from "../../http/errors/api-error.js";

export class LibraryService {
  constructor(private readonly store: LibraryStore) {}

  listCategories(schoolId: string, query: Parameters<LibraryStore["listCategories"]>[1]) {
    return this.run(() => this.store.listCategories(schoolId, query));
  }

  createCategory(input: Parameters<LibraryStore["createCategory"]>[0]) {
    return this.run(() => this.store.createCategory(input));
  }

  async archiveCategory(input: Parameters<LibraryStore["archiveCategory"]>[0]) {
    return this.run(async () => {
      if (!(await this.store.archiveCategory(input))) throw notFound("library category");
    });
  }

  listItems(schoolId: string, query: Parameters<LibraryStore["listItems"]>[1]) {
    return this.run(() => this.store.listItems(schoolId, query));
  }

  async getItem(schoolId: string, itemId: string) {
    return this.run(async () => {
      const item = await this.store.getItem(schoolId, itemId);
      if (!item) throw notFound("library item");
      return item;
    });
  }

  createItem(input: Parameters<LibraryStore["createItem"]>[0]) {
    return this.run(() => this.store.createItem(input));
  }

  async updateItem(input: Parameters<LibraryStore["updateItem"]>[0]) {
    return this.run(async () => {
      const item = await this.store.updateItem(input);
      if (!item) throw notFound("active library item");
      return item;
    });
  }

  async archiveItem(input: Parameters<LibraryStore["archiveItem"]>[0]) {
    return this.run(async () => {
      if (!(await this.store.archiveItem(input))) throw notFound("active library item");
    });
  }

  async listCopies(
    schoolId: string,
    itemId: string,
    query: Parameters<LibraryStore["listCopies"]>[2],
  ) {
    return this.run(async () => {
      const copies = await this.store.listCopies(schoolId, itemId, query);
      if (!copies) throw notFound("library item");
      return copies;
    });
  }

  createCopy(input: Parameters<LibraryStore["createCopy"]>[0]) {
    return this.run(() => this.store.createCopy(input));
  }

  async archiveCopy(input: Parameters<LibraryStore["archiveCopy"]>[0]) {
    return this.run(async () => {
      if (!(await this.store.archiveCopy(input))) throw notFound("active library copy");
    });
  }

  getPolicy(schoolId: string) {
    return this.run(() => this.store.getPolicy(schoolId));
  }

  setPolicy(input: Parameters<LibraryStore["setPolicy"]>[0]) {
    return this.run(() => this.store.setPolicy(input));
  }

  listLoans(schoolId: string, query: Parameters<LibraryStore["listLoans"]>[1]) {
    return this.run(() => this.store.listLoans(schoolId, query));
  }

  checkout(input: Parameters<LibraryStore["checkout"]>[0]) {
    return this.run(() => this.store.checkout(input));
  }

  async returnLoan(input: Parameters<LibraryStore["returnLoan"]>[0]) {
    return this.run(async () => {
      const loan = await this.store.returnLoan(input);
      if (!loan) throw notFound("active library loan");
      return loan;
    });
  }

  async renewLoan(input: Parameters<LibraryStore["renewLoan"]>[0]) {
    return this.run(async () => {
      const loan = await this.store.renewLoan(input);
      if (!loan) throw notFound("active library loan");
      return loan;
    });
  }

  listReservations(schoolId: string, query: Parameters<LibraryStore["listReservations"]>[1]) {
    return this.run(() => this.store.listReservations(schoolId, query));
  }

  createReservation(input: Parameters<LibraryStore["createReservation"]>[0]) {
    return this.run(() => this.store.createReservation(input));
  }

  async cancelReservation(input: Parameters<LibraryStore["cancelReservation"]>[0]) {
    return this.run(async () => {
      const reservation = await this.store.cancelReservation(input);
      if (!reservation) throw notFound("active library reservation");
      return reservation;
    });
  }

  loanReport(schoolId: string, from: string, to: string) {
    return this.run(() => this.store.loanReport(schoolId, from, to));
  }

  private async run<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (error instanceof LibraryStoreError) throw mapStoreError(error);
      throw error;
    }
  }
}

function mapStoreError(error: LibraryStoreError): ApiError {
  switch (error.code) {
    case "NOT_FOUND":
    case "SCHOOL_NOT_FOUND":
      return new ApiError(404, error.code, error.message);
    case "INVALID_RELATIONSHIP":
    case "INVALID_POLICY_VALUE":
      return new ApiError(400, error.code, error.message);
    case "POLICY_NOT_CONFIGURED":
      return new ApiError(409, error.code, error.message);
    case "DUPLICATE":
    case "COPY_UNAVAILABLE":
    case "COPY_RESERVED":
    case "MAX_ACTIVE_LOANS":
    case "RENEWAL_LIMIT_REACHED":
    case "ITEM_HAS_ACTIVE_CIRCULATION":
      return new ApiError(409, error.code, error.message);
  }
}

function notFound(resource: string): ApiError {
  return new ApiError(404, "RECORD_NOT_FOUND", `The requested ${resource} was not found.`);
}
