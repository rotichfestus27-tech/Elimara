import { AcademicRecordStatus, Prisma, type PrismaClient, SchoolStatus } from "@prisma/client";
import type {
  AllocatePaymentInput,
  CreateFeeStructureInput,
  CreateFinancialAdjustmentInput,
  CreatePaymentRefundInput,
  FeeStructureRecord,
  FinanceContext,
  FinancePageQuery,
  FinanceReport,
  FinanceStore,
  FinancialAccountSummary,
  FinancialChargeRecord,
  FinancialPaymentRecord,
  PaymentAllocationRecord,
  PaymentReconciliationRecord,
  PostStudentChargeInput,
  ReconcilePaymentInput,
  RecordFinancialPaymentInput,
  ReverseAllocationInput,
  ReverseChargeInput,
} from "./finance-contracts.js";
import {
  amountToMinorUnits,
  calculateAccountBalance,
  ensureNotExceeding,
  FinanceRuleError,
  formatMinorUnits,
} from "./finance-rules.js";

export class FinanceStoreError extends Error {
  constructor(
    readonly code:
      | "NOT_FOUND"
      | "SCHOOL_NOT_FOUND"
      | "DUPLICATE"
      | "IDEMPOTENCY_CONFLICT"
      | "INVALID_RELATIONSHIP"
      | "INVALID_AMOUNT"
      | "INSUFFICIENT_PAYMENT"
      | "INSUFFICIENT_CHARGE"
      | "CHARGE_HAS_ALLOCATIONS"
      | "ALREADY_REVERSED",
    message: string,
  ) {
    super(message);
    this.name = "FinanceStoreError";
  }
}

const feeStructureSelect = {
  id: true,
  academicYearId: true,
  termId: true,
  classId: true,
  name: true,
  status: true,
  createdAt: true,
  items: {
    orderBy: [{ position: "asc" as const }, { id: "asc" as const }],
    select: { id: true, name: true, amount: true, position: true },
  },
} satisfies Prisma.FeeStructureSelect;

const chargeSelect = {
  id: true,
  accountId: true,
  feeStructureId: true,
  structureName: true,
  totalAmount: true,
  createdAt: true,
  items: {
    orderBy: [{ position: "asc" as const }, { id: "asc" as const }],
    select: { id: true, name: true, amount: true, position: true },
  },
  reversal: { select: { id: true } },
  allocations: {
    select: {
      amount: true,
      reversals: { select: { amount: true } },
    },
  },
} satisfies Prisma.StudentFeeChargeSelect;

const paymentSelect = {
  id: true,
  accountId: true,
  amount: true,
  method: true,
  reference: true,
  receivedAt: true,
  receipt: { select: { id: true } },
  allocations: {
    select: { amount: true, reversals: { select: { amount: true } } },
  },
  refunds: { select: { amount: true } },
} satisfies Prisma.FinancialPaymentSelect;

export class PrismaFinanceStore implements FinanceStore {
  constructor(private readonly prisma: PrismaClient) {}

  async listFeeStructures(schoolId: string, query: FinancePageQuery) {
    const where: Prisma.FeeStructureWhereInput = { schoolId };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.feeStructure.findMany({
        where,
        select: feeStructureSelect,
        orderBy: [{ createdAt: "desc" }, { id: "asc" }],
        skip: query.offset,
        take: query.limit,
      }),
      this.prisma.feeStructure.count({ where }),
    ]);
    return { items: rows.map(mapFeeStructure), total };
  }

  async createFeeStructure(input: CreateFeeStructureInput): Promise<FeeStructureRecord> {
    return this.guard(() =>
      this.transaction(async (tx) => {
        await requireActiveSchool(tx, input.schoolId);
        const [year, term, academicClass] = await Promise.all([
          tx.academicYear.findFirst({
            where: {
              schoolId: input.schoolId,
              id: input.academicYearId,
              status: AcademicRecordStatus.ACTIVE,
            },
            select: { id: true },
          }),
          tx.term.findFirst({
            where: {
              schoolId: input.schoolId,
              academicYearId: input.academicYearId,
              id: input.termId,
              status: AcademicRecordStatus.ACTIVE,
            },
            select: { id: true },
          }),
          tx.academicClass.findFirst({
            where: {
              schoolId: input.schoolId,
              academicYearId: input.academicYearId,
              id: input.classId,
              status: AcademicRecordStatus.ACTIVE,
            },
            select: { id: true },
          }),
        ]);
        if (!year || !term || !academicClass) {
          throw financeError(
            "INVALID_RELATIONSHIP",
            "Select an active same-school academic year, term, and class.",
          );
        }
        const items = validateFeeItems(input.items);
        const row = await tx.feeStructure.create({
          data: {
            schoolId: input.schoolId,
            academicYearId: input.academicYearId,
            termId: input.termId,
            classId: input.classId,
            name: input.name.trim(),
            nameKey: normalizeName(input.name),
            createdByUserId: input.actorUserId,
            items: {
              create: items.map((item, position) => ({
                schoolId: input.schoolId,
                name: item.name,
                nameKey: normalizeName(item.name),
                amount: new Prisma.Decimal(item.amount),
                position,
              })),
            },
          },
          select: feeStructureSelect,
        });
        await audit(tx, input, "FEE_STRUCTURE_CREATED", row.id);
        return mapFeeStructure(row);
      }),
    );
  }

  async deactivateFeeStructure(input: FinanceContext & { feeStructureId: string }) {
    return this.transaction(async (tx) => {
      await requireActiveSchool(tx, input.schoolId);
      const changed = await tx.feeStructure.updateMany({
        where: {
          schoolId: input.schoolId,
          id: input.feeStructureId,
          status: AcademicRecordStatus.ACTIVE,
        },
        data: { status: AcademicRecordStatus.INACTIVE },
      });
      if (changed.count !== 1) return false;
      await audit(tx, input, "FEE_STRUCTURE_DEACTIVATED", input.feeStructureId);
      return true;
    });
  }

  async getAccountSummary(
    schoolId: string,
    studentId: string,
  ): Promise<FinancialAccountSummary | null> {
    return this.prisma.$transaction((tx) => this.readAccountSummary(tx, schoolId, studentId), {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    });
  }

  async listAccounts(schoolId: string, query: FinancePageQuery) {
    return this.prisma.$transaction(
      async (tx) => {
        const [accounts, total] = await Promise.all([
          tx.studentFinancialAccount.findMany({
            where: { schoolId },
            select: {
              id: true,
              studentId: true,
              createdAt: true,
              student: { select: { admissionNumber: true, givenName: true, familyName: true } },
            },
            orderBy: [
              { student: { familyName: "asc" } },
              { student: { givenName: "asc" } },
              { studentId: "asc" },
            ],
            skip: query.offset,
            take: query.limit,
          }),
          tx.studentFinancialAccount.count({ where: { schoolId } }),
        ]);
        const accountIds = accounts.map(({ id }) => id);
        const [charges, payments, adjustments] =
          accountIds.length === 0
            ? [[], [], []]
            : await Promise.all([
                tx.studentFeeCharge.findMany({
                  where: { schoolId, accountId: { in: accountIds } },
                  select: {
                    accountId: true,
                    totalAmount: true,
                    reversal: { select: { amount: true } },
                    allocations: {
                      select: { amount: true, reversals: { select: { amount: true } } },
                    },
                  },
                }),
                tx.financialPayment.findMany({
                  where: { schoolId, accountId: { in: accountIds } },
                  select: {
                    accountId: true,
                    amount: true,
                    refunds: { select: { amount: true } },
                    allocations: {
                      select: { amount: true, reversals: { select: { amount: true } } },
                    },
                  },
                }),
                tx.financialAdjustment.findMany({
                  where: { schoolId, accountId: { in: accountIds } },
                  select: { accountId: true, direction: true, amount: true },
                }),
              ]);
        const groupByAccount = <T extends { accountId: string }>(entries: T[]) => {
          const grouped = new Map<string, T[]>();
          for (const entry of entries) {
            const group = grouped.get(entry.accountId) ?? [];
            group.push(entry);
            grouped.set(entry.accountId, group);
          }
          return grouped;
        };
        const chargesByAccount = groupByAccount(charges);
        const paymentsByAccount = groupByAccount(payments);
        const adjustmentsByAccount = groupByAccount(adjustments);
        const items = accounts.map((account) => ({
          accountId: account.id,
          studentId: account.studentId,
          admissionNumber: account.student.admissionNumber,
          studentGivenName: account.student.givenName,
          studentFamilyName: account.student.familyName,
          ...summarizeAmounts(
            chargesByAccount.get(account.id) ?? [],
            paymentsByAccount.get(account.id) ?? [],
            adjustmentsByAccount.get(account.id) ?? [],
          ),
          createdAt: account.createdAt,
        }));
        return { items, total };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  async listCharges(schoolId: string, studentId: string, query: FinancePageQuery) {
    const account = await this.findAccount(schoolId, studentId);
    if (!account) return null;
    const where = { schoolId, accountId: account.id };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.studentFeeCharge.findMany({
        where,
        select: chargeSelect,
        orderBy: [{ createdAt: "desc" }, { id: "asc" }],
        skip: query.offset,
        take: query.limit,
      }),
      this.prisma.studentFeeCharge.count({ where }),
    ]);
    return { items: rows.map((row) => mapCharge(row, studentId)), total };
  }

  async postCharge(input: PostStudentChargeInput) {
    return this.guard(async () => {
      const fingerprint = input.requestFingerprint;
      try {
        return await this.transaction(async (tx) => {
          await requireActiveSchool(tx, input.schoolId);
          const student = await tx.student.findFirst({
            where: { schoolId: input.schoolId, id: input.studentId, status: "ACTIVE" },
            select: { id: true },
          });
          if (!student)
            throw financeError("NOT_FOUND", "The active student account was not found.");
          const existingAccount = await ensureAccount(tx, input.schoolId, input.studentId);
          await lockAccount(tx, input.schoolId, existingAccount.id);
          const prior = await tx.studentFeeCharge.findFirst({
            where: {
              schoolId: input.schoolId,
              accountId: existingAccount.id,
              idempotencyKey: input.idempotencyKey,
            },
            select: { ...chargeSelect, requestFingerprint: true },
          });
          if (prior) {
            if (prior.requestFingerprint !== fingerprint) {
              throw financeError(
                "IDEMPOTENCY_CONFLICT",
                "This idempotency key was used for different charge data.",
              );
            }
            return mapCharge(prior, input.studentId);
          }
          const structure = await tx.feeStructure.findFirst({
            where: {
              schoolId: input.schoolId,
              id: input.feeStructureId,
              status: AcademicRecordStatus.ACTIVE,
            },
            select: {
              id: true,
              name: true,
              academicYearId: true,
              classId: true,
              items: {
                orderBy: [{ position: "asc" }, { id: "asc" }],
                select: { name: true, amount: true, position: true },
              },
            },
          });
          if (!structure || structure.items.length === 0) {
            throw financeError(
              "INVALID_RELATIONSHIP",
              "The active fee structure must exist in this school.",
            );
          }
          const placement = await tx.studentPlacement.findFirst({
            where: {
              schoolId: input.schoolId,
              studentId: input.studentId,
              academicYearId: structure.academicYearId,
              classId: structure.classId,
              endedAt: null,
            },
            select: { id: true },
          });
          if (!placement) {
            throw financeError(
              "INVALID_RELATIONSHIP",
              "The student must have an active placement in the fee structure's class and year.",
            );
          }
          const total = structure.items.reduce(
            (sum, item) => sum.plus(item.amount),
            new Prisma.Decimal(0),
          );
          amountToMinorUnits(total.toFixed(2));
          const row = await tx.studentFeeCharge.create({
            data: {
              schoolId: input.schoolId,
              accountId: existingAccount.id,
              feeStructureId: structure.id,
              structureName: structure.name,
              totalAmount: total,
              idempotencyKey: input.idempotencyKey,
              requestFingerprint: fingerprint,
              createdByUserId: input.actorUserId,
              items: {
                create: structure.items.map((item) => ({
                  schoolId: input.schoolId,
                  name: item.name,
                  amount: item.amount,
                  position: item.position,
                })),
              },
            },
            select: chargeSelect,
          });
          await audit(tx, input, "FEE_CHARGE_POSTED", row.id);
          return mapCharge(row, input.studentId);
        });
      } catch (error) {
        if (isUniqueConflict(error)) {
          const replay = await this.findChargeByIdempotency(
            input.schoolId,
            input.studentId,
            input.idempotencyKey,
            fingerprint,
          );
          if (replay) return replay;
        }
        throw error;
      }
    });
  }

  async listPayments(schoolId: string, studentId: string, query: FinancePageQuery) {
    const account = await this.findAccount(schoolId, studentId);
    if (!account) return null;
    const where = { schoolId, accountId: account.id };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.financialPayment.findMany({
        where,
        select: paymentSelect,
        orderBy: [{ receivedAt: "desc" }, { id: "asc" }],
        skip: query.offset,
        take: query.limit,
      }),
      this.prisma.financialPayment.count({ where }),
    ]);
    return { items: rows.map((row) => mapPayment(row, studentId)), total };
  }

  async recordPayment(input: RecordFinancialPaymentInput) {
    return this.guard(async () => {
      const amount = parseAmount(input.amount);
      const fingerprint = input.requestFingerprint;
      try {
        return await this.transaction(async (tx) => {
          await requireActiveSchool(tx, input.schoolId);
          const student = await tx.student.findFirst({
            where: { schoolId: input.schoolId, id: input.studentId },
            select: { id: true },
          });
          if (!student) throw financeError("NOT_FOUND", "The student account was not found.");
          const account = await ensureAccount(tx, input.schoolId, input.studentId);
          await lockAccount(tx, input.schoolId, account.id);
          const prior = await tx.financialPayment.findFirst({
            where: {
              schoolId: input.schoolId,
              accountId: account.id,
              idempotencyKey: input.idempotencyKey,
            },
            select: { ...paymentSelect, requestFingerprint: true },
          });
          if (prior) {
            if (prior.requestFingerprint !== fingerprint) {
              throw financeError(
                "IDEMPOTENCY_CONFLICT",
                "This idempotency key was used for different payment data.",
              );
            }
            return mapPayment(prior, input.studentId);
          }
          const payment = await tx.financialPayment.create({
            data: {
              schoolId: input.schoolId,
              accountId: account.id,
              amount: new Prisma.Decimal(amount),
              method: input.method.trim(),
              reference: input.reference?.trim() || null,
              idempotencyKey: input.idempotencyKey,
              requestFingerprint: fingerprint,
              recordedByUserId: input.actorUserId,
            },
            select: paymentSelect,
          });
          const receipt = await tx.financialReceipt.create({
            data: { schoolId: input.schoolId, paymentId: payment.id },
            select: { id: true },
          });
          await audit(tx, input, "FINANCIAL_PAYMENT_RECORDED", payment.id);
          return mapPayment({ ...payment, receipt }, input.studentId);
        });
      } catch (error) {
        if (isUniqueConflict(error)) {
          const replay = await this.findPaymentByIdempotency(
            input.schoolId,
            input.studentId,
            input.idempotencyKey,
            fingerprint,
          );
          if (replay) return replay;
        }
        throw error;
      }
    });
  }

  async allocatePayment(input: AllocatePaymentInput) {
    return this.guard(async () =>
      this.transaction(async (tx) => {
        await requireActiveSchool(tx, input.schoolId);
        const payment = await tx.financialPayment.findFirst({
          where: { schoolId: input.schoolId, id: input.paymentId },
          select: { id: true, accountId: true },
        });
        if (!payment) return null;
        await lockAccount(tx, input.schoolId, payment.accountId);
        const prior = await tx.paymentAllocation.findFirst({
          where: {
            schoolId: input.schoolId,
            paymentId: payment.id,
            idempotencyKey: input.idempotencyKey,
          },
          select: allocationSelect,
        });
        if (prior) {
          const charge = await tx.studentFeeCharge.findFirst({
            where: { schoolId: input.schoolId, id: input.chargeId, accountId: payment.accountId },
            select: { id: true },
          });
          if (
            prior.chargeId !== charge?.id ||
            decimalString(prior.amount) !== parseAmount(input.amount)
          ) {
            throw financeError(
              "IDEMPOTENCY_CONFLICT",
              "This idempotency key was used for a different allocation.",
            );
          }
          return mapAllocation(prior);
        }
        const [paymentTotals, chargeTotals] = await Promise.all([
          paymentAvailability(tx, input.schoolId, payment.id),
          chargeAvailability(tx, input.schoolId, input.chargeId, payment.accountId),
        ]);
        if (!chargeTotals)
          throw financeError(
            "INVALID_RELATIONSHIP",
            "Payment and charge must belong to the same student account.",
          );
        const requested = parseAmount(input.amount);
        ensureAvailable(paymentTotals, requested, "The payment allocation");
        ensureChargeAvailable(chargeTotals, requested);
        const created = await tx.paymentAllocation.create({
          data: {
            schoolId: input.schoolId,
            accountId: payment.accountId,
            paymentId: payment.id,
            chargeId: input.chargeId,
            amount: new Prisma.Decimal(requested),
            idempotencyKey: input.idempotencyKey,
            createdByUserId: input.actorUserId,
          },
          select: allocationSelect,
        });
        await audit(tx, input, "PAYMENT_ALLOCATED", created.id);
        return mapAllocation(created);
      }),
    );
  }

  async reverseAllocation(input: ReverseAllocationInput) {
    return this.guard(async () =>
      this.transaction(async (tx) => {
        await requireActiveSchool(tx, input.schoolId);
        const allocation = await tx.paymentAllocation.findFirst({
          where: { schoolId: input.schoolId, id: input.allocationId },
          select: { id: true, accountId: true, amount: true },
        });
        if (!allocation) return null;
        await lockAccount(tx, input.schoolId, allocation.accountId);
        const prior = await tx.paymentAllocationReversal.findFirst({
          where: {
            schoolId: input.schoolId,
            allocationId: allocation.id,
            idempotencyKey: input.idempotencyKey,
          },
          select: { id: true, amount: true, reason: true, createdAt: true },
        });
        if (prior) {
          if (
            decimalString(prior.amount) !== parseAmount(input.amount) ||
            prior.reason !== input.reason.trim()
          ) {
            throw financeError(
              "IDEMPOTENCY_CONFLICT",
              "This idempotency key was used for different reversal data.",
            );
          }
          const updated = await tx.paymentAllocation.findFirst({
            where: { schoolId: input.schoolId, id: allocation.id },
            select: allocationSelect,
          });
          return updated ? mapAllocation(updated) : null;
        }
        const existing = await tx.paymentAllocationReversal.aggregate({
          where: { schoolId: input.schoolId, allocationId: allocation.id },
          _sum: { amount: true },
        });
        const available = allocation.amount.minus(existing._sum.amount ?? new Prisma.Decimal(0));
        const amount = parseAmount(input.amount);
        ensureNotExceeding(decimalString(available), amount, "The allocation reversal");
        await tx.paymentAllocationReversal.create({
          data: {
            schoolId: input.schoolId,
            allocationId: allocation.id,
            amount: new Prisma.Decimal(amount),
            reason: input.reason.trim(),
            idempotencyKey: input.idempotencyKey,
            actorUserId: input.actorUserId,
          },
          select: { id: true, amount: true, createdAt: true },
        });
        await audit(tx, input, "PAYMENT_ALLOCATION_REVERSED", allocation.id);
        const updated = await tx.paymentAllocation.findFirst({
          where: { schoolId: input.schoolId, id: allocation.id },
          select: allocationSelect,
        });
        return updated ? mapAllocation(updated) : null;
      }),
    );
  }

  async reverseCharge(input: ReverseChargeInput) {
    return this.guard(async () =>
      this.transaction(async (tx) => {
        await requireActiveSchool(tx, input.schoolId);
        const charge = await tx.studentFeeCharge.findFirst({
          where: { schoolId: input.schoolId, id: input.chargeId },
          select: { id: true, accountId: true, totalAmount: true },
        });
        if (!charge) return null;
        await lockAccount(tx, input.schoolId, charge.accountId);
        const prior = await tx.chargeReversal.findFirst({
          where: { schoolId: input.schoolId, idempotencyKey: input.idempotencyKey },
          select: { id: true, amount: true, createdAt: true },
        });
        if (prior) {
          const reversal = await tx.chargeReversal.findFirst({
            where: { schoolId: input.schoolId, idempotencyKey: input.idempotencyKey },
            select: { chargeId: true, reason: true },
          });
          if (reversal?.chargeId !== charge.id || reversal.reason !== input.reason.trim()) {
            throw financeError(
              "IDEMPOTENCY_CONFLICT",
              "This idempotency key was used for different reversal data.",
            );
          }
          return this.readCharge(tx, input.schoolId, charge.id);
        }
        const existingReversal = await tx.chargeReversal.findFirst({
          where: { schoolId: input.schoolId, chargeId: charge.id },
          select: { id: true },
        });
        if (existingReversal) {
          throw financeError("ALREADY_REVERSED", "This charge has already been reversed.");
        }
        const allocations = await tx.paymentAllocation.findMany({
          where: { schoolId: input.schoolId, chargeId: charge.id },
          select: { amount: true, reversals: { select: { amount: true } } },
        });
        const netAllocated = allocations.reduce(
          (sum, item) =>
            sum
              .plus(item.amount)
              .minus(
                item.reversals.reduce(
                  (reversed, entry) => reversed.plus(entry.amount),
                  new Prisma.Decimal(0),
                ),
              ),
          new Prisma.Decimal(0),
        );
        if (!netAllocated.isZero()) {
          throw financeError(
            "CHARGE_HAS_ALLOCATIONS",
            "Reverse all payment allocations before reversing this charge.",
          );
        }
        await tx.chargeReversal.create({
          data: {
            schoolId: input.schoolId,
            chargeId: charge.id,
            amount: charge.totalAmount,
            reason: input.reason.trim(),
            idempotencyKey: input.idempotencyKey,
            actorUserId: input.actorUserId,
          },
        });
        await audit(tx, input, "FEE_CHARGE_REVERSED", charge.id);
        return this.readCharge(tx, input.schoolId, charge.id);
      }),
    );
  }

  async createAdjustment(input: CreateFinancialAdjustmentInput) {
    return this.guard(async () =>
      this.transaction(async (tx) => {
        const amount = parseAmount(input.amount);
        await requireActiveSchool(tx, input.schoolId);
        const student = await tx.student.findFirst({
          where: { schoolId: input.schoolId, id: input.studentId },
          select: { id: true },
        });
        if (!student) return null;
        const account = await ensureAccount(tx, input.schoolId, student.id);
        await lockAccount(tx, input.schoolId, account.id);
        const prior = await tx.financialAdjustment.findFirst({
          where: {
            schoolId: input.schoolId,
            accountId: account.id,
            idempotencyKey: input.idempotencyKey,
          },
          select: { id: true, direction: true, amount: true, reason: true },
        });
        if (prior) {
          const same =
            prior.direction === input.direction &&
            decimalString(prior.amount) === amount &&
            prior.reason === input.reason.trim();
          if (!same)
            throw financeError(
              "IDEMPOTENCY_CONFLICT",
              "This idempotency key was used for different adjustment data.",
            );
          return this.readAccountSummary(tx, input.schoolId, input.studentId);
        }
        await tx.financialAdjustment.create({
          data: {
            schoolId: input.schoolId,
            accountId: account.id,
            direction: input.direction,
            amount: new Prisma.Decimal(amount),
            reason: input.reason.trim(),
            idempotencyKey: input.idempotencyKey,
            actorUserId: input.actorUserId,
          },
        });
        await audit(tx, input, "FINANCIAL_ADJUSTMENT_RECORDED", account.id);
        return this.readAccountSummary(tx, input.schoolId, input.studentId);
      }),
    );
  }

  async refundPayment(input: CreatePaymentRefundInput) {
    return this.guard(async () =>
      this.transaction(async (tx) => {
        await requireActiveSchool(tx, input.schoolId);
        const payment = await tx.financialPayment.findFirst({
          where: { schoolId: input.schoolId, id: input.paymentId },
          select: { id: true, accountId: true },
        });
        if (!payment) return null;
        await lockAccount(tx, input.schoolId, payment.accountId);
        const prior = await tx.paymentRefund.findFirst({
          where: {
            schoolId: input.schoolId,
            paymentId: payment.id,
            idempotencyKey: input.idempotencyKey,
          },
          select: { id: true, amount: true, reference: true, reason: true },
        });
        if (prior) {
          if (
            prior.reference !== input.reference.trim() ||
            prior.reason !== input.reason.trim() ||
            decimalString(prior.amount) !== parseAmount(input.amount)
          ) {
            throw financeError(
              "IDEMPOTENCY_CONFLICT",
              "This idempotency key was used for different refund data.",
            );
          }
          return this.readPayment(tx, input.schoolId, payment.id);
        }
        const availability = await paymentAvailability(tx, input.schoolId, payment.id);
        ensureAvailable(availability, parseAmount(input.amount), "The refund");
        await tx.paymentRefund.create({
          data: {
            schoolId: input.schoolId,
            paymentId: payment.id,
            amount: new Prisma.Decimal(input.amount),
            reference: input.reference.trim(),
            reason: input.reason.trim(),
            idempotencyKey: input.idempotencyKey,
            actorUserId: input.actorUserId,
          },
        });
        await audit(tx, input, "FINANCIAL_PAYMENT_REFUNDED", payment.id);
        return this.readPayment(tx, input.schoolId, payment.id);
      }),
    );
  }

  async reconcilePayment(input: ReconcilePaymentInput) {
    return this.guard(async () =>
      this.transaction(async (tx) => {
        await requireActiveSchool(tx, input.schoolId);
        const payment = await tx.financialPayment.findFirst({
          where: { schoolId: input.schoolId, id: input.paymentId },
          select: { id: true, accountId: true, amount: true },
        });
        if (!payment) return null;
        await lockAccount(tx, input.schoolId, payment.accountId);
        const prior = await tx.paymentReconciliation.findFirst({
          where: {
            schoolId: input.schoolId,
            paymentId: payment.id,
            idempotencyKey: input.idempotencyKey,
          },
          select: { ...reconciliationSelect, note: true, statementReference: true },
        });
        if (prior) {
          const same =
            decimalString(prior.statementAmount) === parseAmount(input.statementAmount, true) &&
            prior.statementReference === (input.statementReference?.trim() || null) &&
            prior.note === input.note.trim();
          if (!same)
            throw financeError(
              "IDEMPOTENCY_CONFLICT",
              "This idempotency key was used for different reconciliation data.",
            );
          return mapReconciliation(prior, payment.amount);
        }
        const statementAmount = parseAmount(input.statementAmount, true);
        const outcome = payment.amount.equals(statementAmount) ? "MATCHED" : "EXCEPTION";
        const created = await tx.paymentReconciliation.create({
          data: {
            schoolId: input.schoolId,
            paymentId: payment.id,
            statementAmount: new Prisma.Decimal(statementAmount),
            statementReference: input.statementReference?.trim() || null,
            note: input.note.trim(),
            outcome,
            idempotencyKey: input.idempotencyKey,
            actorUserId: input.actorUserId,
          },
          select: reconciliationSelect,
        });
        await audit(tx, input, "FINANCIAL_PAYMENT_RECONCILED", payment.id, { outcome });
        return mapReconciliation(created, payment.amount);
      }),
    );
  }

  async listReconciliationExceptions(schoolId: string, query: FinancePageQuery) {
    const rows = await this.prisma.paymentReconciliation.findMany({
      where: { schoolId, outcome: "EXCEPTION" },
      select: { ...reconciliationSelect, payment: { select: { amount: true } } },
      orderBy: [{ createdAt: "desc" }, { id: "asc" }],
      skip: query.offset,
      take: query.limit,
    });
    const total = await this.prisma.paymentReconciliation.count({
      where: { schoolId, outcome: "EXCEPTION" },
    });
    return {
      items: rows.map((row) => mapReconciliation(row, row.payment.amount)),
      total,
    };
  }

  async getReceipt(schoolId: string, receiptId: string) {
    const receipt = await this.prisma.financialReceipt.findFirst({
      where: { schoolId, id: receiptId },
      select: { payment: { select: paymentSelect } },
    });
    if (!receipt) return null;
    const student = await this.prisma.studentFinancialAccount.findFirst({
      where: { schoolId, id: receipt.payment.accountId },
      select: { studentId: true },
    });
    return student ? mapPayment(receipt.payment, student.studentId) : null;
  }

  async getReport(schoolId: string, from: string, to: string): Promise<FinanceReport> {
    const fromDate = dateOnly(from);
    const toDate = dateOnly(to);
    const dateRange = { gte: fromDate, lt: nextDay(toDate) };
    const [
      paymentTotals,
      charges,
      exceptions,
      schoolCharges,
      chargeReversals,
      schoolPayments,
      refunds,
      allocations,
      allocationReversals,
    ] = await Promise.all([
      this.prisma.financialPayment.aggregate({
        where: { schoolId, receivedAt: dateRange },
        _sum: { amount: true },
        _count: { _all: true },
      }),
      this.prisma.studentFeeCharge.count({
        where: { schoolId, createdAt: dateRange },
      }),
      this.prisma.paymentReconciliation.count({
        where: { schoolId, outcome: "EXCEPTION", createdAt: dateRange },
      }),
      this.prisma.studentFeeCharge.aggregate({
        where: { schoolId },
        _sum: { totalAmount: true },
      }),
      this.prisma.chargeReversal.aggregate({
        where: { schoolId },
        _sum: { amount: true },
      }),
      this.prisma.financialPayment.aggregate({
        where: { schoolId },
        _sum: { amount: true },
      }),
      this.prisma.paymentRefund.aggregate({
        where: { schoolId },
        _sum: { amount: true },
      }),
      this.prisma.paymentAllocation.aggregate({
        where: { schoolId },
        _sum: { amount: true },
      }),
      this.prisma.paymentAllocationReversal.aggregate({
        where: { schoolId },
        _sum: { amount: true },
      }),
    ]);
    const chargeTotal = amountToMinorUnits(
      decimalString(schoolCharges._sum.totalAmount ?? new Prisma.Decimal(0)),
      true,
    );
    const chargeReversalTotal = amountToMinorUnits(
      decimalString(chargeReversals._sum.amount ?? new Prisma.Decimal(0)),
      true,
    );
    const paymentTotal = amountToMinorUnits(
      decimalString(schoolPayments._sum.amount ?? new Prisma.Decimal(0)),
      true,
    );
    const refundTotal = amountToMinorUnits(
      decimalString(refunds._sum.amount ?? new Prisma.Decimal(0)),
      true,
    );
    const allocatedTotal = amountToMinorUnits(
      decimalString(allocations._sum.amount ?? new Prisma.Decimal(0)),
      true,
    );
    const allocationReversalTotal = amountToMinorUnits(
      decimalString(allocationReversals._sum.amount ?? new Prisma.Decimal(0)),
      true,
    );
    return {
      from,
      to,
      paymentsReceived: decimalString(paymentTotals._sum.amount ?? new Prisma.Decimal(0)),
      paymentCount: paymentTotals._count._all,
      chargeCount: charges,
      outstandingCharges: formatMinorUnits(
        chargeTotal - chargeReversalTotal - allocatedTotal + allocationReversalTotal,
      ),
      unappliedCredit: formatMinorUnits(
        paymentTotal - refundTotal - allocatedTotal + allocationReversalTotal,
      ),
      reconciliationExceptionCount: exceptions,
    };
  }

  private async findAccount(schoolId: string, studentId: string) {
    return this.prisma.studentFinancialAccount.findFirst({
      where: { schoolId, studentId },
      select: { id: true },
    });
  }

  private async findChargeByIdempotency(
    schoolId: string,
    studentId: string,
    key: string,
    fingerprint: string,
  ) {
    const row = await this.prisma.studentFeeCharge.findFirst({
      where: { schoolId, account: { studentId }, idempotencyKey: key },
      select: { ...chargeSelect, requestFingerprint: true },
    });
    if (!row) return null;
    if (row.requestFingerprint !== fingerprint) {
      throw financeError(
        "IDEMPOTENCY_CONFLICT",
        "This idempotency key was used for different charge data.",
      );
    }
    return mapCharge(row, studentId);
  }

  private async findPaymentByIdempotency(
    schoolId: string,
    studentId: string,
    key: string,
    fingerprint: string,
  ) {
    const row = await this.prisma.financialPayment.findFirst({
      where: { schoolId, account: { studentId }, idempotencyKey: key },
      select: { ...paymentSelect, requestFingerprint: true },
    });
    if (!row) return null;
    if (row.requestFingerprint !== fingerprint) {
      throw financeError(
        "IDEMPOTENCY_CONFLICT",
        "This idempotency key was used for different payment data.",
      );
    }
    return mapPayment(row, studentId);
  }

  private async readCharge(tx: Prisma.TransactionClient, schoolId: string, chargeId: string) {
    const row = await tx.studentFeeCharge.findFirst({
      where: { schoolId, id: chargeId },
      select: { ...chargeSelect, account: { select: { studentId: true } } },
    });
    return row ? mapCharge(row, row.account.studentId) : null;
  }

  private async readPayment(tx: Prisma.TransactionClient, schoolId: string, paymentId: string) {
    const row = await tx.financialPayment.findFirst({
      where: { schoolId, id: paymentId },
      select: { ...paymentSelect, account: { select: { studentId: true } } },
    });
    return row ? mapPayment(row, row.account.studentId) : null;
  }

  private async readAccountSummary(
    tx: Prisma.TransactionClient,
    schoolId: string,
    studentId: string,
  ) {
    const account = await tx.studentFinancialAccount.findFirst({
      where: { schoolId, studentId },
      select: {
        id: true,
        studentId: true,
        createdAt: true,
        student: { select: { admissionNumber: true, givenName: true, familyName: true } },
      },
    });
    if (!account) return null;
    const [charges, payments, adjustments] = await Promise.all([
      tx.studentFeeCharge.findMany({
        where: { schoolId, accountId: account.id },
        select: {
          totalAmount: true,
          reversal: { select: { amount: true } },
          allocations: { select: { amount: true, reversals: { select: { amount: true } } } },
        },
      }),
      tx.financialPayment.findMany({
        where: { schoolId, accountId: account.id },
        select: {
          amount: true,
          refunds: { select: { amount: true } },
          allocations: { select: { amount: true, reversals: { select: { amount: true } } } },
        },
      }),
      tx.financialAdjustment.findMany({
        where: { schoolId, accountId: account.id },
        select: { direction: true, amount: true },
      }),
    ]);
    const balance = summarizeAmounts(charges, payments, adjustments);
    return {
      accountId: account.id,
      studentId: account.studentId,
      admissionNumber: account.student.admissionNumber,
      studentGivenName: account.student.givenName,
      studentFamilyName: account.student.familyName,
      ...balance,
      createdAt: account.createdAt,
    };
  }

  private async transaction<T>(
    operation: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        return await this.prisma.$transaction(operation, {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        });
      } catch (error) {
        const retryable =
          error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034";
        if (!retryable || attempt === 2) throw error;
      }
    }
    throw new Error("Financial transaction retry limit was exceeded.");
  }

  private async guard<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (error instanceof FinanceStoreError) throw error;
      if (error instanceof FinanceRuleError) throw financeError("INVALID_AMOUNT", error.message);
      if (isUniqueConflict(error)) {
        throw financeError("DUPLICATE", "The financial record conflicts with an existing record.");
      }
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        ["P2003", "P2004"].includes(error.code)
      ) {
        throw financeError(
          "INVALID_RELATIONSHIP",
          "The financial record violates a data-integrity rule.",
        );
      }
      throw error;
    }
  }
}

const allocationSelect = {
  id: true,
  paymentId: true,
  chargeId: true,
  amount: true,
  createdAt: true,
  reversals: { select: { amount: true } },
} satisfies Prisma.PaymentAllocationSelect;

const reconciliationSelect = {
  id: true,
  paymentId: true,
  statementAmount: true,
  statementReference: true,
  outcome: true,
  note: true,
  createdAt: true,
} satisfies Prisma.PaymentReconciliationSelect;

function mapFeeStructure(
  row: Prisma.FeeStructureGetPayload<{ select: typeof feeStructureSelect }>,
): FeeStructureRecord {
  return {
    id: row.id,
    academicYearId: row.academicYearId,
    termId: row.termId,
    classId: row.classId,
    name: row.name,
    status: row.status,
    createdAt: row.createdAt,
    items: row.items.map((item) => ({
      id: item.id,
      name: item.name,
      amount: decimalString(item.amount),
      position: item.position,
    })),
  };
}

function mapCharge(
  row: Prisma.StudentFeeChargeGetPayload<{ select: typeof chargeSelect }> & {
    account?: { studentId: string };
  },
  studentId: string,
): FinancialChargeRecord {
  const allocated = sumDecimals(row.allocations.map((allocation) => allocation.amount));
  const reversed = sumDecimals(
    row.allocations.flatMap((allocation) => allocation.reversals.map((entry) => entry.amount)),
  );
  const outstanding = row.reversal
    ? "0.00"
    : formatMinorUnits(
        amountToMinorUnits(decimalString(row.totalAmount)) -
          amountToMinorUnits(decimalString(allocated), true) +
          amountToMinorUnits(decimalString(reversed), true),
      );
  return {
    id: row.id,
    studentId,
    feeStructureId: row.feeStructureId,
    structureName: row.structureName,
    totalAmount: decimalString(row.totalAmount),
    allocatedAmount: decimalString(allocated),
    allocationReversedAmount: decimalString(reversed),
    outstandingAmount: outstanding,
    reversed: Boolean(row.reversal),
    createdAt: row.createdAt,
    items: row.items.map((item) => ({
      id: item.id,
      name: item.name,
      amount: decimalString(item.amount),
      position: item.position,
    })),
  };
}

function mapPayment(
  row: Prisma.FinancialPaymentGetPayload<{ select: typeof paymentSelect }> & {
    requestFingerprint?: string;
    account?: { studentId: string };
  },
  studentId: string,
): FinancialPaymentRecord {
  if (!row.receipt) {
    throw financeError(
      "INVALID_RELATIONSHIP",
      "A posted payment is missing its required receipt record.",
    );
  }
  const allocated = sumDecimals(row.allocations.map((allocation) => allocation.amount));
  const allocationReversed = sumDecimals(
    row.allocations.flatMap((allocation) => allocation.reversals.map((entry) => entry.amount)),
  );
  const refunded = sumDecimals(row.refunds.map((refund) => refund.amount));
  const available =
    amountToMinorUnits(decimalString(row.amount)) -
    amountToMinorUnits(decimalString(refunded), true) -
    amountToMinorUnits(decimalString(allocated), true) +
    amountToMinorUnits(decimalString(allocationReversed), true);
  return {
    id: row.id,
    studentId,
    amount: decimalString(row.amount),
    method: row.method,
    reference: row.reference,
    receivedAt: row.receivedAt,
    receiptId: row.receipt?.id ?? "",
    allocatedAmount: decimalString(allocated),
    allocationReversedAmount: decimalString(allocationReversed),
    refundedAmount: decimalString(refunded),
    unappliedAmount: formatMinorUnits(available),
  };
}

function mapAllocation(
  row: Prisma.PaymentAllocationGetPayload<{ select: typeof allocationSelect }>,
): PaymentAllocationRecord {
  return {
    id: row.id,
    paymentId: row.paymentId,
    chargeId: row.chargeId,
    amount: decimalString(row.amount),
    reversedAmount: decimalString(sumDecimals(row.reversals.map((item) => item.amount))),
    createdAt: row.createdAt,
  };
}

function mapReconciliation(
  row: Prisma.PaymentReconciliationGetPayload<{ select: typeof reconciliationSelect }> & {
    payment?: { amount: Prisma.Decimal };
  },
  paymentAmount: Prisma.Decimal,
): PaymentReconciliationRecord {
  return {
    id: row.id,
    paymentId: row.paymentId,
    paymentAmount: decimalString(paymentAmount),
    statementAmount: decimalString(row.statementAmount),
    statementReference: row.statementReference,
    outcome: row.outcome,
    note: row.note,
    createdAt: row.createdAt,
  };
}

function summarizeAmounts(
  charges: Array<{
    totalAmount: Prisma.Decimal;
    reversal: { amount: Prisma.Decimal } | null;
    allocations: Array<{ amount: Prisma.Decimal; reversals: Array<{ amount: Prisma.Decimal }> }>;
  }>,
  payments: Array<{
    amount: Prisma.Decimal;
    refunds: Array<{ amount: Prisma.Decimal }>;
    allocations: Array<{ amount: Prisma.Decimal; reversals: Array<{ amount: Prisma.Decimal }> }>;
  }>,
  adjustments: Array<{ direction: "DEBIT" | "CREDIT"; amount: Prisma.Decimal }>,
) {
  return calculateAccountBalance({
    charges: charges.map((item) => decimalString(item.totalAmount)),
    chargeReversals: charges.flatMap((item) =>
      item.reversal ? [decimalString(item.reversal.amount)] : [],
    ),
    payments: payments.map((item) => decimalString(item.amount)),
    refunds: payments.flatMap((item) => item.refunds.map((refund) => decimalString(refund.amount))),
    debits: adjustments
      .filter((item) => item.direction === "DEBIT")
      .map((item) => decimalString(item.amount)),
    credits: adjustments
      .filter((item) => item.direction === "CREDIT")
      .map((item) => decimalString(item.amount)),
    allocated: payments.flatMap((item) =>
      item.allocations.map((allocation) => decimalString(allocation.amount)),
    ),
    allocationReversals: payments.flatMap((item) =>
      item.allocations.flatMap((allocation) =>
        allocation.reversals.map((reversal) => decimalString(reversal.amount)),
      ),
    ),
  });
}

async function ensureAccount(tx: Prisma.TransactionClient, schoolId: string, studentId: string) {
  return tx.studentFinancialAccount.upsert({
    where: { schoolId_studentId: { schoolId, studentId } },
    create: { schoolId, studentId },
    update: {},
    select: { id: true },
  });
}

async function lockAccount(tx: Prisma.TransactionClient, schoolId: string, accountId: string) {
  await tx.$queryRaw`SELECT id FROM student_financial_accounts WHERE school_id = ${schoolId}::uuid AND id = ${accountId}::uuid FOR UPDATE`;
}

async function paymentAvailability(
  tx: Prisma.TransactionClient,
  schoolId: string,
  paymentId: string,
) {
  const [payment, refunds, allocations] = await Promise.all([
    tx.financialPayment.findFirst({
      where: { schoolId, id: paymentId },
      select: { amount: true },
    }),
    tx.paymentRefund.aggregate({
      where: { schoolId, paymentId },
      _sum: { amount: true },
    }),
    tx.paymentAllocation.findMany({
      where: { schoolId, paymentId },
      select: { amount: true, reversals: { select: { amount: true } } },
    }),
  ]);
  if (!payment) return "0.00";
  const allocated = allocations.reduce(
    (sum, allocation) =>
      sum
        .plus(allocation.amount)
        .minus(
          allocation.reversals.reduce(
            (reversed, item) => reversed.plus(item.amount),
            new Prisma.Decimal(0),
          ),
        ),
    new Prisma.Decimal(0),
  );
  return decimalString(
    payment.amount.minus(refunds._sum.amount ?? new Prisma.Decimal(0)).minus(allocated),
  );
}

async function chargeAvailability(
  tx: Prisma.TransactionClient,
  schoolId: string,
  chargeId: string,
  accountId: string,
) {
  const charge = await tx.studentFeeCharge.findFirst({
    where: { schoolId, id: chargeId, accountId },
    select: {
      totalAmount: true,
      reversal: { select: { id: true } },
      allocations: { select: { amount: true, reversals: { select: { amount: true } } } },
    },
  });
  if (!charge || charge.reversal) return null;
  const allocated = charge.allocations.reduce(
    (sum, allocation) =>
      sum
        .plus(allocation.amount)
        .minus(
          allocation.reversals.reduce(
            (reversed, item) => reversed.plus(item.amount),
            new Prisma.Decimal(0),
          ),
        ),
    new Prisma.Decimal(0),
  );
  return decimalString(charge.totalAmount.minus(allocated));
}

async function requireActiveSchool(tx: Prisma.TransactionClient, schoolId: string) {
  const rows = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT "id" FROM "schools"
    WHERE "id" = ${schoolId}::uuid AND "status" = ${SchoolStatus.ACTIVE}::"SchoolStatus"
    FOR SHARE
  `;
  if (rows.length !== 1) throw financeError("SCHOOL_NOT_FOUND", "The school is not available.");
}

async function audit(
  tx: Prisma.TransactionClient,
  input: FinanceContext,
  eventType: string,
  targetId: string,
  metadata: Prisma.InputJsonObject = {},
) {
  await tx.securityAuditEvent.create({
    data: {
      actorUserId: input.actorUserId,
      schoolId: input.schoolId,
      eventType,
      outcome: "SUCCESS",
      requestId: input.requestId,
      metadata: { targetId, ...metadata },
    },
  });
}

function validateFeeItems(items: Array<{ name: string; amount: string }>) {
  if (items.length < 1 || items.length > 100) {
    throw financeError("INVALID_AMOUNT", "A fee structure must contain 1 to 100 items.");
  }
  const names = new Set<string>();
  let total = 0n;
  const normalized = items.map((item) => {
    const name = item.name.trim();
    const key = normalizeName(name);
    if (!name || name.length > 120 || names.has(key)) {
      throw financeError(
        "INVALID_RELATIONSHIP",
        "Fee item names must be non-empty and unique within the structure.",
      );
    }
    names.add(key);
    const amount = parseAmount(item.amount);
    total += amountToMinorUnits(amount);
    return { name, amount };
  });
  if (total > 99_999_999_999_999n) {
    throw financeError(
      "INVALID_AMOUNT",
      "The fee structure total exceeds the supported KES amount.",
    );
  }
  return normalized;
}

function parseAmount(value: string, allowZero = false): string {
  amountToMinorUnits(value, allowZero);
  const [whole = "0", fraction = ""] = value.split(".");
  return `${whole}.${fraction.padEnd(2, "0")}`;
}

function ensureAvailable(available: string, requested: string, label: string) {
  try {
    ensureNotExceeding(available, requested, label);
  } catch (error) {
    throw financeError(
      "INSUFFICIENT_PAYMENT",
      error instanceof Error ? error.message : `${label} exceeds the available amount.`,
    );
  }
}

function ensureChargeAvailable(available: string, requested: string) {
  try {
    ensureNotExceeding(available, requested, "The allocation");
  } catch (error) {
    throw financeError(
      "INSUFFICIENT_CHARGE",
      error instanceof Error ? error.message : "Allocation exceeds the charge balance.",
    );
  }
}

function sumDecimals(values: Prisma.Decimal[]): Prisma.Decimal {
  return values.reduce((sum, value) => sum.plus(value), new Prisma.Decimal(0));
}

function decimalString(value: Prisma.Decimal): string {
  return value.toFixed(2);
}

function normalizeName(value: string): string {
  return value.trim().toLocaleLowerCase("en");
}

function dateOnly(value: string): Date {
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw financeError("INVALID_RELATIONSHIP", "The supplied date is invalid.");
  }
  return parsed;
}

function nextDay(value: Date): Date {
  const result = new Date(value);
  result.setUTCDate(result.getUTCDate() + 1);
  return result;
}

function isUniqueConflict(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

function financeError(
  code: ConstructorParameters<typeof FinanceStoreError>[0],
  message: string,
): FinanceStoreError {
  return new FinanceStoreError(code, message);
}
