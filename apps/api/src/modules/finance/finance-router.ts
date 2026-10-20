import { type Request, type RequestHandler, type Response, Router } from "express";
import { z } from "zod";
import type { AppConfig } from "../../config/env.js";
import { ApiError } from "../../http/errors/api-error.js";
import { validateRequest } from "../../http/middleware/validate-request.js";
import {
  requireAuthentication,
  requireCsrf,
  requireSchoolPermission,
} from "../identity/auth-middleware.js";
import type { AuthService } from "../identity/auth-service.js";
import type { FinanceService } from "./finance-service.js";

const permissions = {
  feeRead: "finance.fees.read",
  feeManage: "finance.fees.manage",
  accountRead: "finance.accounts.read",
  chargePost: "finance.charges.post",
  paymentRead: "finance.payments.read",
  paymentRecord: "finance.payments.record",
  reconcile: "finance.payments.reconcile",
  adjustment: "finance.adjustments.manage",
  refund: "finance.refunds.manage",
  report: "finance.reports.read",
  receiptRead: "finance.receipts.read",
} as const;

const schoolParams = z.object({ schoolId: z.uuid() }).strict();
const studentParams = schoolParams.extend({ studentId: z.uuid() }).strict();
const structureParams = schoolParams.extend({ feeStructureId: z.uuid() }).strict();
const paymentParams = schoolParams.extend({ paymentId: z.uuid() }).strict();
const chargeParams = schoolParams.extend({ chargeId: z.uuid() }).strict();
const allocationParams = schoolParams.extend({ allocationId: z.uuid() }).strict();
const receiptParams = schoolParams.extend({ receiptId: z.uuid() }).strict();
const pageQuery = z
  .object({
    limit: z.coerce.number().int().min(1).max(100).default(25),
    offset: z.coerce.number().int().min(0).max(1_000_000).default(0),
  })
  .strict();
const amount = z.string().regex(/^(?:0|[1-9]\d{0,11})(?:\.\d{1,2})?$/);
const positiveAmount = amount.refine(
  (value) => /[1-9]/.test(value),
  "Amount must be greater than zero.",
);
const feeStructureBody = z
  .object({
    academicYearId: z.uuid(),
    termId: z.uuid(),
    classId: z.uuid(),
    name: z.string().trim().min(1).max(120),
    items: z
      .array(
        z
          .object({
            name: z.string().trim().min(1).max(120),
            amount: positiveAmount,
          })
          .strict(),
      )
      .min(1)
      .max(100),
  })
  .strict();
const postChargeBody = z.object({ feeStructureId: z.uuid() }).strict();
const paymentBody = z
  .object({
    amount: positiveAmount,
    method: z.string().trim().min(1).max(40),
    reference: z.string().trim().min(1).max(120).optional(),
  })
  .strict();
const allocationBody = z
  .object({
    chargeId: z.uuid(),
    amount: positiveAmount,
  })
  .strict();
const reversalBody = z
  .object({
    amount: positiveAmount,
    reason: z.string().trim().min(1).max(500),
  })
  .strict();
const chargeReversalBody = z.object({ reason: z.string().trim().min(1).max(500) }).strict();
const adjustmentBody = z
  .object({
    direction: z.enum(["DEBIT", "CREDIT"]),
    amount: positiveAmount,
    reason: z.string().trim().min(1).max(500),
  })
  .strict();
const refundBody = z
  .object({
    amount: positiveAmount,
    reference: z.string().trim().min(1).max(120),
    reason: z.string().trim().min(1).max(500),
  })
  .strict();
const reconciliationBody = z
  .object({
    statementAmount: amount,
    statementReference: z.string().trim().min(1).max(120).optional(),
    note: z.string().trim().min(1).max(500),
  })
  .strict();
const reportQuery = z
  .object({
    from: z.iso.date(),
    to: z.iso.date(),
  })
  .strict()
  .refine((query) => query.from <= query.to, {
    message: "from must be on or before to.",
    path: ["to"],
  })
  .refine(
    (query) => {
      const days =
        (Date.parse(`${query.to}T00:00:00Z`) - Date.parse(`${query.from}T00:00:00Z`)) / 86_400_000;
      return days <= 366;
    },
    {
      message: "Date ranges cannot exceed 367 calendar days.",
      path: ["to"],
    },
  );

export function createFinanceRouter(
  service: FinanceService,
  authService: AuthService,
  config: AppConfig,
): Router {
  const router = Router();
  const authenticate = requireAuthentication(authService, config);
  const csrf = requireCsrf(config);

  router.get(
    "/schools/:schoolId/finance/fee-structures",
    authenticate,
    validateRequest({ params: schoolParams, query: pageQuery }),
    requireSchoolPermission(authService, permissions.feeRead),
    route(async (request, response) => {
      const query = pageQuery.parse(request.query);
      const result = await service.listFeeStructures(schoolId(request), query);
      response.json({
        data: result.items.map(serializeStructure),
        meta: pageMeta(query, result.total),
      });
    }),
  );

  router.post(
    "/schools/:schoolId/finance/fee-structures",
    authenticate,
    csrf,
    validateRequest({ params: schoolParams, body: feeStructureBody }),
    requireSchoolPermission(authService, permissions.feeManage),
    route(async (request, response) => {
      const result = await service.createFeeStructure({
        ...context(request, response),
        ...feeStructureBody.parse(request.body),
      });
      response.status(201).json({ data: serializeStructure(result) });
    }),
  );

  router.post(
    "/schools/:schoolId/finance/fee-structures/:feeStructureId/deactivate",
    authenticate,
    csrf,
    validateRequest({ params: structureParams }),
    requireSchoolPermission(authService, permissions.feeManage),
    route(async (request, response) => {
      await service.deactivateFeeStructure({
        ...context(request, response),
        feeStructureId: id(request, "feeStructureId"),
      });
      response.status(204).end();
    }),
  );

  router.get(
    "/schools/:schoolId/finance/accounts",
    authenticate,
    validateRequest({ params: schoolParams, query: pageQuery }),
    requireSchoolPermission(authService, permissions.accountRead),
    route(async (request, response) => {
      const query = pageQuery.parse(request.query);
      const result = await service.listAccounts(schoolId(request), query);
      response.json({ data: result.items, meta: pageMeta(query, result.total) });
    }),
  );

  router.get(
    "/schools/:schoolId/students/:studentId/finance/account",
    authenticate,
    validateRequest({ params: studentParams }),
    requireSchoolPermission(authService, permissions.accountRead),
    route(async (request, response) => {
      response.json({
        data: await service.accountSummary(schoolId(request), id(request, "studentId")),
      });
    }),
  );

  router.get(
    "/schools/:schoolId/students/:studentId/finance/charges",
    authenticate,
    validateRequest({ params: studentParams, query: pageQuery }),
    requireSchoolPermission(authService, permissions.accountRead),
    route(async (request, response) => {
      const query = pageQuery.parse(request.query);
      const result = await service.listCharges(schoolId(request), id(request, "studentId"), query);
      response.json({ data: result.items, meta: pageMeta(query, result.total) });
    }),
  );

  router.post(
    "/schools/:schoolId/students/:studentId/finance/charges",
    authenticate,
    csrf,
    validateRequest({ params: studentParams, body: postChargeBody }),
    requireSchoolPermission(authService, permissions.chargePost),
    route(async (request, response) => {
      const result = await service.postCharge({
        ...context(request, response),
        studentId: id(request, "studentId"),
        ...postChargeBody.parse(request.body),
        idempotencyKey: idempotencyKey(request),
      });
      response.status(201).json({ data: result });
    }),
  );

  router.get(
    "/schools/:schoolId/students/:studentId/finance/payments",
    authenticate,
    validateRequest({ params: studentParams, query: pageQuery }),
    requireSchoolPermission(authService, permissions.paymentRead),
    route(async (request, response) => {
      const query = pageQuery.parse(request.query);
      const result = await service.listPayments(schoolId(request), id(request, "studentId"), query);
      response.json({ data: result.items, meta: pageMeta(query, result.total) });
    }),
  );

  router.post(
    "/schools/:schoolId/students/:studentId/finance/payments",
    authenticate,
    csrf,
    validateRequest({ params: studentParams, body: paymentBody }),
    requireSchoolPermission(authService, permissions.paymentRecord),
    route(async (request, response) => {
      const result = await service.recordPayment({
        ...context(request, response),
        studentId: id(request, "studentId"),
        ...paymentBody.parse(request.body),
        idempotencyKey: idempotencyKey(request),
      });
      response.status(201).json({ data: result });
    }),
  );

  router.post(
    "/schools/:schoolId/finance/payments/:paymentId/allocations",
    authenticate,
    csrf,
    validateRequest({ params: paymentParams, body: allocationBody }),
    requireSchoolPermission(authService, permissions.adjustment),
    route(async (request, response) => {
      const result = await service.allocatePayment({
        ...context(request, response),
        paymentId: id(request, "paymentId"),
        ...allocationBody.parse(request.body),
        idempotencyKey: idempotencyKey(request),
      });
      response.status(201).json({ data: result });
    }),
  );

  router.post(
    "/schools/:schoolId/finance/allocations/:allocationId/reverse",
    authenticate,
    csrf,
    validateRequest({ params: allocationParams, body: reversalBody }),
    requireSchoolPermission(authService, permissions.adjustment),
    route(async (request, response) => {
      const result = await service.reverseAllocation({
        ...context(request, response),
        allocationId: id(request, "allocationId"),
        ...reversalBody.parse(request.body),
        idempotencyKey: idempotencyKey(request),
      });
      response.json({ data: result });
    }),
  );

  router.post(
    "/schools/:schoolId/finance/charges/:chargeId/reverse",
    authenticate,
    csrf,
    validateRequest({ params: chargeParams, body: chargeReversalBody }),
    requireSchoolPermission(authService, permissions.adjustment),
    route(async (request, response) => {
      const result = await service.reverseCharge({
        ...context(request, response),
        chargeId: id(request, "chargeId"),
        ...chargeReversalBody.parse(request.body),
        idempotencyKey: idempotencyKey(request),
      });
      response.json({ data: result });
    }),
  );

  router.post(
    "/schools/:schoolId/students/:studentId/finance/adjustments",
    authenticate,
    csrf,
    validateRequest({ params: studentParams, body: adjustmentBody }),
    requireSchoolPermission(authService, permissions.adjustment),
    route(async (request, response) => {
      const result = await service.createAdjustment({
        ...context(request, response),
        studentId: id(request, "studentId"),
        ...adjustmentBody.parse(request.body),
        idempotencyKey: idempotencyKey(request),
      });
      response.status(201).json({ data: result });
    }),
  );

  router.post(
    "/schools/:schoolId/finance/payments/:paymentId/refunds",
    authenticate,
    csrf,
    validateRequest({ params: paymentParams, body: refundBody }),
    requireSchoolPermission(authService, permissions.refund),
    route(async (request, response) => {
      const result = await service.refundPayment({
        ...context(request, response),
        paymentId: id(request, "paymentId"),
        ...refundBody.parse(request.body),
        idempotencyKey: idempotencyKey(request),
      });
      response.json({ data: result });
    }),
  );

  router.post(
    "/schools/:schoolId/finance/payments/:paymentId/reconciliation",
    authenticate,
    csrf,
    validateRequest({ params: paymentParams, body: reconciliationBody }),
    requireSchoolPermission(authService, permissions.reconcile),
    route(async (request, response) => {
      const result = await service.reconcilePayment({
        ...context(request, response),
        paymentId: id(request, "paymentId"),
        ...reconciliationBody.parse(request.body),
        idempotencyKey: idempotencyKey(request),
      });
      response.status(201).json({ data: result });
    }),
  );

  router.get(
    "/schools/:schoolId/finance/reconciliation/exceptions",
    authenticate,
    validateRequest({ params: schoolParams, query: pageQuery }),
    requireSchoolPermission(authService, permissions.reconcile),
    route(async (request, response) => {
      const query = pageQuery.parse(request.query);
      const result = await service.listReconciliationExceptions(schoolId(request), query);
      response.json({ data: result.items, meta: pageMeta(query, result.total) });
    }),
  );

  router.get(
    "/schools/:schoolId/finance/receipts/:receiptId",
    authenticate,
    validateRequest({ params: receiptParams }),
    requireSchoolPermission(authService, permissions.receiptRead),
    route(async (request, response) => {
      response.json({
        data: await service.getReceipt(schoolId(request), id(request, "receiptId")),
      });
    }),
  );

  router.get(
    "/schools/:schoolId/finance/reports/summary",
    authenticate,
    validateRequest({ params: schoolParams, query: reportQuery }),
    requireSchoolPermission(authService, permissions.report),
    route(async (request, response) => {
      const query = reportQuery.parse(request.query);
      response.json({ data: await service.getReport(schoolId(request), query.from, query.to) });
    }),
  );

  return router;
}

function context(request: Request, response: Response) {
  return {
    schoolId: schoolId(request),
    actorUserId: authenticatedUserId(response),
    requestId: response.getHeader("x-request-id")?.toString() ?? "unknown",
  };
}

function schoolId(request: Request): string {
  const value = request.params["schoolId"];
  if (typeof value !== "string")
    throw new ApiError(400, "INVALID_SCHOOL", "A school context is required.");
  return value;
}

function id(request: Request, key: string): string {
  const value = request.params[key];
  if (typeof value !== "string") throw new ApiError(400, "INVALID_ID", "A record ID is required.");
  return value;
}

function idempotencyKey(request: Request): string {
  const value = request.get("Idempotency-Key");
  if (!value || value.length > 128 || !/^[\x21-\x7e]+$/.test(value)) {
    throw new ApiError(
      400,
      "IDEMPOTENCY_KEY_REQUIRED",
      "A valid Idempotency-Key header is required.",
    );
  }
  return value;
}

function authenticatedUserId(response: Response): string {
  const userId = response.locals.auth?.user.id;
  if (!userId) throw new ApiError(401, "UNAUTHENTICATED", "Authentication is required.");
  return userId;
}

function serializeStructure(
  value: Awaited<ReturnType<FinanceService["listFeeStructures"]>>["items"][number],
) {
  return { ...value, createdAt: value.createdAt.toISOString() };
}

function pageMeta(query: { limit: number; offset: number }, total: number) {
  return { limit: query.limit, offset: query.offset, total };
}

function route(handler: (request: Request, response: Response) => Promise<void>): RequestHandler {
  return (request, response, next) => {
    void handler(request, response).catch(next);
  };
}
