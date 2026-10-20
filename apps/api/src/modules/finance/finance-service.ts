import { createHash } from "node:crypto";
import { type FinanceStore, FinanceStoreError } from "@elimara/database";
import { ApiError } from "../../http/errors/api-error.js";

export class FinanceService {
  constructor(private readonly store: FinanceStore) {}

  listFeeStructures(schoolId: string, query: Parameters<FinanceStore["listFeeStructures"]>[1]) {
    return this.run(() => this.store.listFeeStructures(schoolId, query));
  }

  createFeeStructure(input: Parameters<FinanceStore["createFeeStructure"]>[0]) {
    return this.run(() => this.store.createFeeStructure(input));
  }

  async deactivateFeeStructure(input: Parameters<FinanceStore["deactivateFeeStructure"]>[0]) {
    return this.run(async () => {
      if (!(await this.store.deactivateFeeStructure(input))) throw notFound("fee structure");
    });
  }

  async accountSummary(schoolId: string, studentId: string) {
    return this.run(async () => {
      const result = await this.store.getAccountSummary(schoolId, studentId);
      if (!result) throw notFound("student financial account");
      return result;
    });
  }

  listAccounts(schoolId: string, query: Parameters<FinanceStore["listAccounts"]>[1]) {
    return this.run(() => this.store.listAccounts(schoolId, query));
  }

  async listCharges(
    schoolId: string,
    studentId: string,
    query: Parameters<FinanceStore["listCharges"]>[2],
  ) {
    return this.run(async () => {
      const result = await this.store.listCharges(schoolId, studentId, query);
      if (!result) throw notFound("student financial account");
      return result;
    });
  }

  async postCharge(input: Omit<Parameters<FinanceStore["postCharge"]>[0], "requestFingerprint">) {
    return this.run(async () => {
      const result = await this.store.postCharge({
        ...input,
        requestFingerprint: fingerprint({
          studentId: input.studentId,
          feeStructureId: input.feeStructureId,
        }),
      });
      if (!result) throw notFound("student financial account");
      return result;
    });
  }

  async listPayments(
    schoolId: string,
    studentId: string,
    query: Parameters<FinanceStore["listPayments"]>[2],
  ) {
    return this.run(async () => {
      const result = await this.store.listPayments(schoolId, studentId, query);
      if (!result) throw notFound("student financial account");
      return result;
    });
  }

  async recordPayment(
    input: Omit<Parameters<FinanceStore["recordPayment"]>[0], "requestFingerprint">,
  ) {
    return this.run(async () => {
      const result = await this.store.recordPayment({
        ...input,
        requestFingerprint: fingerprint({
          studentId: input.studentId,
          amount: input.amount,
          method: input.method,
          reference: input.reference ?? null,
        }),
      });
      if (!result) throw notFound("student financial account");
      return result;
    });
  }

  async allocatePayment(input: Parameters<FinanceStore["allocatePayment"]>[0]) {
    return this.run(async () => {
      const result = await this.store.allocatePayment(input);
      if (!result) throw notFound("payment");
      return result;
    });
  }

  async reverseAllocation(input: Parameters<FinanceStore["reverseAllocation"]>[0]) {
    return this.run(async () => {
      const result = await this.store.reverseAllocation(input);
      if (!result) throw notFound("payment allocation");
      return result;
    });
  }

  async reverseCharge(input: Parameters<FinanceStore["reverseCharge"]>[0]) {
    return this.run(async () => {
      const result = await this.store.reverseCharge(input);
      if (!result) throw notFound("fee charge");
      return result;
    });
  }

  async createAdjustment(input: Parameters<FinanceStore["createAdjustment"]>[0]) {
    return this.run(async () => {
      const result = await this.store.createAdjustment(input);
      if (!result) throw notFound("student");
      return result;
    });
  }

  async refundPayment(input: Parameters<FinanceStore["refundPayment"]>[0]) {
    return this.run(async () => {
      const result = await this.store.refundPayment(input);
      if (!result) throw notFound("payment");
      return result;
    });
  }

  async reconcilePayment(input: Parameters<FinanceStore["reconcilePayment"]>[0]) {
    return this.run(async () => {
      const result = await this.store.reconcilePayment(input);
      if (!result) throw notFound("payment");
      return result;
    });
  }

  listReconciliationExceptions(
    schoolId: string,
    query: Parameters<FinanceStore["listReconciliationExceptions"]>[1],
  ) {
    return this.run(() => this.store.listReconciliationExceptions(schoolId, query));
  }

  async getReceipt(schoolId: string, receiptId: string) {
    return this.run(async () => {
      const result = await this.store.getReceipt(schoolId, receiptId);
      if (!result) throw notFound("receipt");
      return result;
    });
  }

  getReport(schoolId: string, from: string, to: string) {
    return this.run(() => this.store.getReport(schoolId, from, to));
  }

  private async run<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (error instanceof FinanceStoreError) throw mapStoreError(error);
      throw error;
    }
  }
}

function mapStoreError(error: FinanceStoreError): ApiError {
  switch (error.code) {
    case "NOT_FOUND":
    case "SCHOOL_NOT_FOUND":
      return new ApiError(404, error.code, error.message);
    case "INVALID_RELATIONSHIP":
    case "INVALID_AMOUNT":
      return new ApiError(400, error.code, error.message);
    case "DUPLICATE":
    case "IDEMPOTENCY_CONFLICT":
    case "INSUFFICIENT_PAYMENT":
    case "INSUFFICIENT_CHARGE":
    case "CHARGE_HAS_ALLOCATIONS":
    case "ALREADY_REVERSED":
      return new ApiError(409, error.code, error.message);
  }
}

function notFound(resource: string): ApiError {
  return new ApiError(404, "RECORD_NOT_FOUND", `The requested ${resource} was not found.`);
}

function fingerprint(value: object): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
