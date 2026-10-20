export type FinanceContext = {
  schoolId: string;
  actorUserId: string;
  requestId: string;
};

export type FinancePageQuery = {
  limit: number;
  offset: number;
};

export type FinanceStructureItemInput = { name: string; amount: string };
export type CreateFeeStructureInput = FinanceContext & {
  academicYearId: string;
  termId: string;
  classId: string;
  name: string;
  items: FinanceStructureItemInput[];
};

export type FeeStructureItemRecord = FinanceStructureItemInput & {
  id: string;
  position: number;
};

export type FeeStructureRecord = {
  id: string;
  academicYearId: string;
  termId: string;
  classId: string;
  name: string;
  status: "ACTIVE" | "INACTIVE";
  createdAt: Date;
  items: FeeStructureItemRecord[];
};

export type FinancialAccountSummary = {
  accountId: string;
  studentId: string;
  admissionNumber: string;
  studentGivenName: string;
  studentFamilyName: string;
  totalCharges: string;
  totalChargeReversals: string;
  totalPayments: string;
  totalRefunds: string;
  totalDebits: string;
  totalCredits: string;
  totalAllocated: string;
  totalAllocationReversals: string;
  outstandingCharges: string;
  unappliedCredit: string;
  balanceDue: string;
  netBalance: string;
  createdAt: Date;
};

export type FinancialChargeRecord = {
  id: string;
  studentId: string;
  feeStructureId: string;
  structureName: string;
  totalAmount: string;
  allocatedAmount: string;
  allocationReversedAmount: string;
  outstandingAmount: string;
  reversed: boolean;
  createdAt: Date;
  items: Array<{ id: string; name: string; amount: string; position: number }>;
};

export type FinancialPaymentRecord = {
  id: string;
  studentId: string;
  amount: string;
  method: string;
  reference: string | null;
  receivedAt: Date;
  receiptId: string;
  allocatedAmount: string;
  allocationReversedAmount: string;
  refundedAmount: string;
  unappliedAmount: string;
};

export type PaymentAllocationRecord = {
  id: string;
  paymentId: string;
  chargeId: string;
  amount: string;
  reversedAmount: string;
  createdAt: Date;
};

export type PaymentReconciliationRecord = {
  id: string;
  paymentId: string;
  paymentAmount: string;
  statementAmount: string;
  statementReference: string | null;
  outcome: "MATCHED" | "EXCEPTION";
  note: string;
  createdAt: Date;
};

export type FinanceReport = {
  from: string;
  to: string;
  paymentsReceived: string;
  paymentCount: number;
  chargeCount: number;
  outstandingCharges: string;
  unappliedCredit: string;
  reconciliationExceptionCount: number;
};

export type PostStudentChargeInput = FinanceContext & {
  studentId: string;
  feeStructureId: string;
  idempotencyKey: string;
  requestFingerprint: string;
};

export type RecordFinancialPaymentInput = FinanceContext & {
  studentId: string;
  amount: string;
  method: string;
  reference?: string;
  idempotencyKey: string;
  requestFingerprint: string;
};

export type AllocatePaymentInput = FinanceContext & {
  paymentId: string;
  chargeId: string;
  amount: string;
  idempotencyKey: string;
};

export type ReverseAllocationInput = FinanceContext & {
  allocationId: string;
  amount: string;
  reason: string;
  idempotencyKey: string;
};

export type ReverseChargeInput = FinanceContext & {
  chargeId: string;
  reason: string;
  idempotencyKey: string;
};

export type CreateFinancialAdjustmentInput = FinanceContext & {
  studentId: string;
  direction: "DEBIT" | "CREDIT";
  amount: string;
  reason: string;
  idempotencyKey: string;
};

export type CreatePaymentRefundInput = FinanceContext & {
  paymentId: string;
  amount: string;
  reference: string;
  reason: string;
  idempotencyKey: string;
};

export type ReconcilePaymentInput = FinanceContext & {
  paymentId: string;
  statementAmount: string;
  statementReference?: string;
  note: string;
  idempotencyKey: string;
};

export interface FinanceStore {
  listFeeStructures(schoolId: string, query: FinancePageQuery): Promise<{
    items: FeeStructureRecord[];
    total: number;
  }>;
  createFeeStructure(input: CreateFeeStructureInput): Promise<FeeStructureRecord>;
  deactivateFeeStructure(input: FinanceContext & { feeStructureId: string }): Promise<boolean>;
  getAccountSummary(
    schoolId: string,
    studentId: string,
  ): Promise<FinancialAccountSummary | null>;
  listAccounts(
    schoolId: string,
    query: FinancePageQuery,
  ): Promise<{ items: FinancialAccountSummary[]; total: number }>;
  listCharges(
    schoolId: string,
    studentId: string,
    query: FinancePageQuery,
  ): Promise<{ items: FinancialChargeRecord[]; total: number } | null>;
  postCharge(input: PostStudentChargeInput): Promise<FinancialChargeRecord | null>;
  listPayments(
    schoolId: string,
    studentId: string,
    query: FinancePageQuery,
  ): Promise<{ items: FinancialPaymentRecord[]; total: number } | null>;
  recordPayment(input: RecordFinancialPaymentInput): Promise<FinancialPaymentRecord | null>;
  allocatePayment(input: AllocatePaymentInput): Promise<PaymentAllocationRecord | null>;
  reverseAllocation(input: ReverseAllocationInput): Promise<PaymentAllocationRecord | null>;
  reverseCharge(input: ReverseChargeInput): Promise<FinancialChargeRecord | null>;
  createAdjustment(
    input: CreateFinancialAdjustmentInput,
  ): Promise<FinancialAccountSummary | null>;
  refundPayment(input: CreatePaymentRefundInput): Promise<FinancialPaymentRecord | null>;
  reconcilePayment(
    input: ReconcilePaymentInput,
  ): Promise<PaymentReconciliationRecord | null>;
  listReconciliationExceptions(
    schoolId: string,
    query: FinancePageQuery,
  ): Promise<{ items: PaymentReconciliationRecord[]; total: number }>;
  getReceipt(schoolId: string, receiptId: string): Promise<FinancialPaymentRecord | null>;
  getReport(schoolId: string, from: string, to: string): Promise<FinanceReport>;
}
