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
import type { LibraryService } from "./library-service.js";

const permissions = {
  catalogRead: "library.catalog.read",
  catalogManage: "library.catalog.manage",
  loansRead: "library.loans.read",
  loansManage: "library.loans.manage",
  reservationsRead: "library.reservations.read",
  reservationsManage: "library.reservations.manage",
  policyManage: "library.policy.manage",
  reportsRead: "library.reports.read",
} as const;

const schoolParams = z.object({ schoolId: z.uuid() }).strict();
const categoryParams = schoolParams.extend({ categoryId: z.uuid() }).strict();
const itemParams = schoolParams.extend({ itemId: z.uuid() }).strict();
const copyParams = itemParams.extend({ copyId: z.uuid() }).strict();
const loanParams = schoolParams.extend({ loanId: z.uuid() }).strict();
const reservationParams = schoolParams.extend({ reservationId: z.uuid() }).strict();

const archivedQuery = z
  .enum(["true", "false"])
  .optional()
  .transform((value) => value === "true");
const pageQuery = z
  .object({
    limit: z.coerce.number().int().min(1).max(100).default(25),
    offset: z.coerce.number().int().min(0).max(1_000_000).default(0),
    includeArchived: archivedQuery,
  })
  .strict();
const categoryQuery = pageQuery;
const itemQuery = pageQuery
  .extend({
    categoryId: z.uuid().optional(),
    search: z.string().trim().min(1).max(120).optional(),
  })
  .strict();
const loanQuery = pageQuery
  .omit({ includeArchived: true })
  .extend({
    itemId: z.uuid().optional(),
    studentId: z.uuid().optional(),
    staffId: z.uuid().optional(),
    status: z.enum(["ACTIVE", "RETURNED", "ALL"]).default("ALL"),
  })
  .strict()
  .refine((query) => !(query.studentId && query.staffId), {
    message: "Filter by either studentId or staffId, not both.",
  });
const reservationQuery = pageQuery
  .omit({ includeArchived: true })
  .extend({
    itemId: z.uuid().optional(),
    studentId: z.uuid().optional(),
    staffId: z.uuid().optional(),
    status: z.enum(["QUEUED", "READY", "FULFILLED", "CANCELLED", "EXPIRED"]).optional(),
  })
  .strict()
  .refine((query) => !(query.studentId && query.staffId), {
    message: "Filter by either studentId or staffId, not both.",
  });
const reportQuery = z
  .object({ from: z.iso.date(), to: z.iso.date() })
  .strict()
  .refine((query) => query.from <= query.to, {
    message: "from must be on or before to.",
    path: ["to"],
  })
  .refine(
    (query) =>
      (Date.parse(`${query.to}T00:00:00Z`) - Date.parse(`${query.from}T00:00:00Z`)) / 86_400_000 <=
      365,
    { message: "Date ranges cannot exceed 366 calendar days.", path: ["to"] },
  );

const categoryBody = z.object({ name: z.string().trim().min(1).max(100) }).strict();
const createItemBody = z
  .object({
    title: z.string().trim().min(1).max(240),
    author: z.string().trim().min(1).max(240).nullable().optional(),
    isbn: z.string().trim().min(1).max(24).nullable().optional(),
    categoryId: z.uuid().nullable().optional(),
  })
  .strict();
const updateItemBody = createItemBody
  .partial()
  .strict()
  .refine((body) => Object.keys(body).length > 0, "At least one field must be provided.");
const policyBody = z
  .object({
    loanPeriodDays: z.number().int().min(1).max(2_147_483_647),
    maxActiveLoans: z.number().int().min(1).max(2_147_483_647),
    maxRenewals: z.number().int().min(0).max(2_147_483_647),
    reservationHoldDays: z.number().int().min(1).max(2_147_483_647),
  })
  .strict();
const borrowerBody = z
  .object({
    studentId: z.uuid().optional(),
    staffId: z.uuid().optional(),
  })
  .strict()
  .refine((body) => Boolean(body.studentId) !== Boolean(body.staffId), {
    message: "Provide exactly one studentId or staffId.",
  });
const checkoutBody = borrowerBody.extend({ copyId: z.uuid() }).strict();
const reservationBody = borrowerBody.extend({ itemId: z.uuid() }).strict();

export function createLibraryRouter(
  service: LibraryService,
  authService: AuthService,
  config: AppConfig,
): Router {
  const router = Router();
  const authenticate = requireAuthentication(authService, config);
  const csrf = requireCsrf(config);

  router.get(
    "/schools/:schoolId/library/categories",
    authenticate,
    validateRequest({ params: schoolParams, query: categoryQuery }),
    requireSchoolPermission(authService, permissions.catalogRead),
    route(async (request, response) => {
      const query = categoryQuery.parse(request.query);
      const result = await service.listCategories(schoolId(request), query);
      response.json({
        data: result.items.map(serializeCategory),
        meta: pageMeta(query, result.total),
      });
    }),
  );

  router.post(
    "/schools/:schoolId/library/categories",
    authenticate,
    csrf,
    validateRequest({ params: schoolParams, body: categoryBody }),
    requireSchoolPermission(authService, permissions.catalogManage),
    route(async (request, response) => {
      const category = await service.createCategory({
        ...context(request, response),
        ...categoryBody.parse(request.body),
      });
      response.status(201).json({ data: serializeCategory(category) });
    }),
  );

  router.post(
    "/schools/:schoolId/library/categories/:categoryId/archive",
    authenticate,
    csrf,
    validateRequest({ params: categoryParams }),
    requireSchoolPermission(authService, permissions.catalogManage),
    route(async (request, response) => {
      await service.archiveCategory({
        ...context(request, response),
        categoryId: id(request, "categoryId"),
      });
      response.status(204).end();
    }),
  );

  router.get(
    "/schools/:schoolId/library/catalog/items",
    authenticate,
    validateRequest({ params: schoolParams, query: itemQuery }),
    requireSchoolPermission(authService, permissions.catalogRead),
    route(async (request, response) => {
      const query = itemQuery.parse(request.query);
      const result = await service.listItems(schoolId(request), query);
      response.json({ data: result.items.map(serializeItem), meta: pageMeta(query, result.total) });
    }),
  );

  router.post(
    "/schools/:schoolId/library/catalog/items",
    authenticate,
    csrf,
    validateRequest({ params: schoolParams, body: createItemBody }),
    requireSchoolPermission(authService, permissions.catalogManage),
    route(async (request, response) => {
      const item = await service.createItem({
        ...context(request, response),
        ...createItemBody.parse(request.body),
      });
      response.status(201).json({ data: serializeItem(item) });
    }),
  );

  router.get(
    "/schools/:schoolId/library/catalog/items/:itemId",
    authenticate,
    validateRequest({ params: itemParams }),
    requireSchoolPermission(authService, permissions.catalogRead),
    route(async (request, response) => {
      const item = await service.getItem(schoolId(request), id(request, "itemId"));
      response.json({ data: serializeItem(item) });
    }),
  );

  router.patch(
    "/schools/:schoolId/library/catalog/items/:itemId",
    authenticate,
    csrf,
    validateRequest({ params: itemParams, body: updateItemBody }),
    requireSchoolPermission(authService, permissions.catalogManage),
    route(async (request, response) => {
      const item = await service.updateItem({
        ...context(request, response),
        itemId: id(request, "itemId"),
        ...updateItemBody.parse(request.body),
      });
      response.json({ data: serializeItem(item) });
    }),
  );

  router.post(
    "/schools/:schoolId/library/catalog/items/:itemId/archive",
    authenticate,
    csrf,
    validateRequest({ params: itemParams }),
    requireSchoolPermission(authService, permissions.catalogManage),
    route(async (request, response) => {
      await service.archiveItem({ ...context(request, response), itemId: id(request, "itemId") });
      response.status(204).end();
    }),
  );

  router.get(
    "/schools/:schoolId/library/catalog/items/:itemId/copies",
    authenticate,
    validateRequest({ params: itemParams, query: pageQuery }),
    requireSchoolPermission(authService, permissions.catalogRead),
    route(async (request, response) => {
      const query = pageQuery.parse(request.query);
      const result = await service.listCopies(schoolId(request), id(request, "itemId"), query);
      response.json({ data: result.items.map(serializeCopy), meta: pageMeta(query, result.total) });
    }),
  );

  router.post(
    "/schools/:schoolId/library/catalog/items/:itemId/copies",
    authenticate,
    csrf,
    validateRequest({ params: itemParams }),
    requireSchoolPermission(authService, permissions.catalogManage),
    route(async (request, response) => {
      const copy = await service.createCopy({
        ...context(request, response),
        itemId: id(request, "itemId"),
      });
      response.status(201).json({ data: serializeCopy(copy) });
    }),
  );

  router.post(
    "/schools/:schoolId/library/catalog/items/:itemId/copies/:copyId/archive",
    authenticate,
    csrf,
    validateRequest({ params: copyParams }),
    requireSchoolPermission(authService, permissions.catalogManage),
    route(async (request, response) => {
      await service.archiveCopy({
        ...context(request, response),
        itemId: id(request, "itemId"),
        copyId: id(request, "copyId"),
      });
      response.status(204).end();
    }),
  );

  router.get(
    "/schools/:schoolId/library/policy",
    authenticate,
    validateRequest({ params: schoolParams }),
    requireSchoolPermission(authService, permissions.policyManage),
    route(async (request, response) => {
      response.json({ data: await service.getPolicy(schoolId(request)) });
    }),
  );

  router.put(
    "/schools/:schoolId/library/policy",
    authenticate,
    csrf,
    validateRequest({ params: schoolParams, body: policyBody }),
    requireSchoolPermission(authService, permissions.policyManage),
    route(async (request, response) => {
      const policy = await service.setPolicy({
        ...context(request, response),
        ...policyBody.parse(request.body),
      });
      response.json({ data: serializePolicy(policy) });
    }),
  );

  router.get(
    "/schools/:schoolId/library/loans",
    authenticate,
    validateRequest({ params: schoolParams, query: loanQuery }),
    requireSchoolPermission(authService, permissions.loansRead),
    route(async (request, response) => {
      const query = loanQuery.parse(request.query);
      const result = await service.listLoans(schoolId(request), query);
      response.json({ data: result.items.map(serializeLoan), meta: pageMeta(query, result.total) });
    }),
  );

  router.post(
    "/schools/:schoolId/library/loans",
    authenticate,
    csrf,
    validateRequest({ params: schoolParams, body: checkoutBody }),
    requireSchoolPermission(authService, permissions.loansManage),
    route(async (request, response) => {
      const loan = await service.checkout({
        ...context(request, response),
        ...checkoutBody.parse(request.body),
      });
      response.status(201).json({ data: serializeLoan(loan) });
    }),
  );

  router.post(
    "/schools/:schoolId/library/loans/:loanId/return",
    authenticate,
    csrf,
    validateRequest({ params: loanParams }),
    requireSchoolPermission(authService, permissions.loansManage),
    route(async (request, response) => {
      const loan = await service.returnLoan({
        ...context(request, response),
        loanId: id(request, "loanId"),
      });
      response.json({ data: serializeLoan(loan) });
    }),
  );

  router.post(
    "/schools/:schoolId/library/loans/:loanId/renew",
    authenticate,
    csrf,
    validateRequest({ params: loanParams }),
    requireSchoolPermission(authService, permissions.loansManage),
    route(async (request, response) => {
      const loan = await service.renewLoan({
        ...context(request, response),
        loanId: id(request, "loanId"),
      });
      response.json({ data: serializeLoan(loan) });
    }),
  );

  router.get(
    "/schools/:schoolId/library/reservations",
    authenticate,
    validateRequest({ params: schoolParams, query: reservationQuery }),
    requireSchoolPermission(authService, permissions.reservationsRead),
    route(async (request, response) => {
      const query = reservationQuery.parse(request.query);
      const result = await service.listReservations(schoolId(request), query);
      response.json({
        data: result.items.map(serializeReservation),
        meta: pageMeta(query, result.total),
      });
    }),
  );

  router.post(
    "/schools/:schoolId/library/reservations",
    authenticate,
    csrf,
    validateRequest({ params: schoolParams, body: reservationBody }),
    requireSchoolPermission(authService, permissions.reservationsManage),
    route(async (request, response) => {
      const reservation = await service.createReservation({
        ...context(request, response),
        ...reservationBody.parse(request.body),
      });
      response.status(201).json({ data: serializeReservation(reservation) });
    }),
  );

  router.post(
    "/schools/:schoolId/library/reservations/:reservationId/cancel",
    authenticate,
    csrf,
    validateRequest({ params: reservationParams }),
    requireSchoolPermission(authService, permissions.reservationsManage),
    route(async (request, response) => {
      const reservation = await service.cancelReservation({
        ...context(request, response),
        reservationId: id(request, "reservationId"),
      });
      response.json({ data: serializeReservation(reservation) });
    }),
  );

  router.get(
    "/schools/:schoolId/library/reports/loans",
    authenticate,
    validateRequest({ params: schoolParams, query: reportQuery }),
    requireSchoolPermission(authService, permissions.reportsRead),
    route(async (request, response) => {
      const query = reportQuery.parse(request.query);
      response.json({
        data: await service.loanReport(schoolId(request), query.from, query.to),
      });
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
  if (typeof value !== "string") {
    throw new ApiError(400, "INVALID_SCHOOL", "A school context is required.");
  }
  return value;
}

function id(request: Request, key: string): string {
  const value = request.params[key];
  if (typeof value !== "string") throw new ApiError(400, "INVALID_ID", "A record ID is required.");
  return value;
}

function authenticatedUserId(response: Response): string {
  const userId = response.locals.auth?.user.id;
  if (!userId) throw new ApiError(401, "UNAUTHENTICATED", "Authentication is required.");
  return userId;
}

function pageMeta(query: { limit: number; offset: number }, total: number) {
  return { limit: query.limit, offset: query.offset, total };
}

function serializeCategory<T extends { archivedAt: Date | null; createdAt: Date; updatedAt: Date }>(
  record: T,
) {
  return {
    ...record,
    archivedAt: record.archivedAt?.toISOString() ?? null,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

function serializeItem<T extends { archivedAt: Date | null; createdAt: Date; updatedAt: Date }>(
  record: T,
) {
  return {
    ...record,
    archivedAt: record.archivedAt?.toISOString() ?? null,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

function serializeCopy<T extends { archivedAt: Date | null; createdAt: Date; updatedAt: Date }>(
  record: T,
) {
  return {
    ...record,
    archivedAt: record.archivedAt?.toISOString() ?? null,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

function serializePolicy<T extends { updatedAt: Date }>(record: T) {
  return { ...record, updatedAt: record.updatedAt.toISOString() };
}

function serializeLoan<
  T extends {
    checkedOutAt: Date;
    dueOn: Date;
    returnedAt: Date | null;
  },
>(record: T) {
  return {
    ...record,
    checkedOutAt: record.checkedOutAt.toISOString(),
    dueOn: record.dueOn.toISOString().slice(0, 10),
    returnedAt: record.returnedAt?.toISOString() ?? null,
  };
}

function serializeReservation<
  T extends {
    status: string;
    readyAt: Date | null;
    expiresAt: Date | null;
    completedAt: Date | null;
    createdAt: Date;
  },
>(record: T) {
  const expired = Boolean(
    record.status === "READY" && record.expiresAt && record.expiresAt <= new Date(),
  );
  return {
    ...record,
    readyAt: record.readyAt?.toISOString() ?? null,
    expiresAt: record.expiresAt?.toISOString() ?? null,
    completedAt: record.completedAt?.toISOString() ?? null,
    createdAt: record.createdAt.toISOString(),
    expired,
    effectiveStatus: expired ? "EXPIRED" : record.status,
  };
}

function route(handler: (request: Request, response: Response) => Promise<void>): RequestHandler {
  return (request, response, next) => {
    void handler(request, response).catch(next);
  };
}
