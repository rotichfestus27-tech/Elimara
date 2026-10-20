import { Router, type Request, type RequestHandler, type Response } from "express";
import { z, type ZodType } from "zod";
import type { ConfigurationListQuery, ConfigurationResource } from "@elimara/database";
import type { AppConfig } from "../../config/env.js";
import { ApiError } from "../../http/errors/api-error.js";
import { validateRequest } from "../../http/middleware/validate-request.js";
import type { AuthService } from "../identity/auth-service.js";
import {
  requireAuthentication,
  requireCsrf,
  requireSchoolPermission,
} from "../identity/auth-middleware.js";
import type { SchoolConfigurationService } from "./school-configuration-service.js";

const profileReadPermission = "school.profile.read";
const profileUpdatePermission = "school.profile.update";
const configurationReadPermission = "academics.configuration.read";
const configurationManagePermission = "academics.configuration.manage";

const schoolParamsSchema = z.object({ schoolId: z.uuid() }).strict();
const idParamsSchema = schoolParamsSchema.extend({ id: z.uuid() }).strict();
const listBaseSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(25),
  offset: z.coerce.number().int().min(0).max(1_000_000).default(0),
  status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
  q: z.string().trim().min(1).max(100).optional(),
  sortOrder: z.enum(["asc", "desc"]).default("asc"),
});

const academicYearListSchema = listBaseSchema.extend({
  sortBy: z.enum(["name", "startsOn", "endsOn", "createdAt"]).default("startsOn"),
});
const termListSchema = listBaseSchema.extend({
  academicYearId: z.uuid(),
  sortBy: z.enum(["name", "startsOn", "endsOn", "createdAt"]).default("startsOn"),
});
const classListSchema = listBaseSchema.extend({
  academicYearId: z.uuid(),
  sortBy: z.enum(["name", "createdAt"]).default("name"),
});
const streamListSchema = listBaseSchema.extend({
  classId: z.uuid(),
  sortBy: z.enum(["name", "createdAt"]).default("name"),
});
const subjectListSchema = listBaseSchema.extend({
  sortBy: z.enum(["name", "createdAt"]).default("name"),
});
const classSubjectListSchema = listBaseSchema.extend({
  classId: z.uuid(),
  sortBy: z.enum(["createdAt", "status"]).default("createdAt"),
});

const profileUpdateSchema = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    contactEmail: z.email().max(320).nullable().optional(),
    contactPhone: z.string().trim().min(7).max(40).nullable().optional(),
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, "Provide at least one field to update.");

const periodCreateSchema = z
  .object({
    name: z.string().trim().min(1).max(100),
    startsOn: z.iso.date(),
    endsOn: z.iso.date(),
  })
  .strict()
  .refine((data) => data.startsOn <= data.endsOn, {
    message: "startsOn must be on or before endsOn.",
    path: ["endsOn"],
  });
const periodUpdateSchema = z
  .object({
    name: z.string().trim().min(1).max(100).optional(),
    startsOn: z.iso.date().optional(),
    endsOn: z.iso.date().optional(),
  })
  .strict()
  .refine(
    (data) =>
      data.startsOn === undefined || data.endsOn === undefined || data.startsOn <= data.endsOn,
    { message: "startsOn must be on or before endsOn.", path: ["endsOn"] },
  )
  .refine((data) => Object.keys(data).length > 0, "Provide at least one field to update.");
const termCreateSchema = periodCreateSchema.extend({ academicYearId: z.uuid() }).strict();
const classCreateSchema = z
  .object({ academicYearId: z.uuid(), name: z.string().trim().min(1).max(100) })
  .strict();
const namedCreateSchema = z.object({ name: z.string().trim().min(1).max(120) }).strict();
const namedUpdateSchema = z.object({ name: z.string().trim().min(1).max(120) }).strict();
const academicNameUpdateSchema = z.object({ name: z.string().trim().min(1).max(100) }).strict();
const streamCreateSchema = z
  .object({ classId: z.uuid(), name: z.string().trim().min(1).max(100) })
  .strict();
const classSubjectCreateSchema = z.object({ classId: z.uuid(), subjectId: z.uuid() }).strict();
const deactivateParamsSchema = idParamsSchema;

type ParsedListValues = {
  academicYearId?: string;
  classId?: string;
  limit: number;
  offset: number;
  q?: string;
  sortBy: string;
  sortOrder: "asc" | "desc";
  status?: "ACTIVE" | "INACTIVE";
};

export function createSchoolConfigurationRouter(
  service: SchoolConfigurationService,
  authService: AuthService,
  config: AppConfig,
): Router {
  const router = Router();
  const authenticate = requireAuthentication(authService, config);

  router.get(
    "/schools/:schoolId",
    authenticate,
    validateRequest({ params: schoolParamsSchema }),
    requireSchoolPermission(authService, profileReadPermission),
    route(async (request, response) => {
      const profile = await service.getSchoolProfile(schoolId(request));
      response.json({ data: serializeSchoolProfile(profile) });
    }),
  );

  router.patch(
    "/schools/:schoolId",
    authenticate,
    requireCsrf(config),
    validateRequest({ params: schoolParamsSchema, body: profileUpdateSchema }),
    requireSchoolPermission(authService, profileUpdatePermission),
    route(async (request, response) => {
      const body = profileUpdateSchema.parse(request.body);
      const actor = authenticatedUserId(response);
      const profile = await service.updateSchoolProfile({
        schoolId: schoolId(request),
        actorUserId: actor,
        requestId: requestId(response),
        data: body,
      });
      response.json({ data: serializeSchoolProfile(profile) });
    }),
  );

  registerCollectionRoutes(router, {
    path: "/schools/:schoolId/academic-years",
    resource: "academicYears",
    listSchema: academicYearListSchema,
    createSchema: periodCreateSchema,
    service,
    authService,
    authenticate,
    config,
  });
  registerCollectionRoutes(router, {
    path: "/schools/:schoolId/terms",
    resource: "terms",
    listSchema: termListSchema,
    createSchema: termCreateSchema,
    service,
    authService,
    authenticate,
    config,
  });
  registerCollectionRoutes(router, {
    path: "/schools/:schoolId/classes",
    resource: "classes",
    listSchema: classListSchema,
    createSchema: classCreateSchema,
    service,
    authService,
    authenticate,
    config,
  });
  registerCollectionRoutes(router, {
    path: "/schools/:schoolId/streams",
    resource: "streams",
    listSchema: streamListSchema,
    createSchema: streamCreateSchema,
    service,
    authService,
    authenticate,
    config,
  });
  registerCollectionRoutes(router, {
    path: "/schools/:schoolId/subjects",
    resource: "subjects",
    listSchema: subjectListSchema,
    createSchema: namedCreateSchema,
    service,
    authService,
    authenticate,
    config,
  });
  registerCollectionRoutes(router, {
    path: "/schools/:schoolId/class-subjects",
    resource: "classSubjects",
    listSchema: classSubjectListSchema,
    createSchema: classSubjectCreateSchema,
    service,
    authService,
    authenticate,
    config,
  });

  registerItemRoutes(router, {
    path: "/schools/:schoolId/academic-years",
    resource: "academicYears",
    updateSchema: periodUpdateSchema,
    service,
    authService,
    authenticate,
    config,
  });
  registerItemRoutes(router, {
    path: "/schools/:schoolId/terms",
    resource: "terms",
    updateSchema: periodUpdateSchema,
    service,
    authService,
    authenticate,
    config,
  });
  registerItemRoutes(router, {
    path: "/schools/:schoolId/classes",
    resource: "classes",
    updateSchema: academicNameUpdateSchema,
    service,
    authService,
    authenticate,
    config,
  });
  registerItemRoutes(router, {
    path: "/schools/:schoolId/streams",
    resource: "streams",
    updateSchema: academicNameUpdateSchema,
    service,
    authService,
    authenticate,
    config,
  });
  registerItemRoutes(router, {
    path: "/schools/:schoolId/subjects",
    resource: "subjects",
    updateSchema: namedUpdateSchema,
    service,
    authService,
    authenticate,
    config,
  });
  registerItemRoutes(router, {
    path: "/schools/:schoolId/class-subjects",
    resource: "classSubjects",
    service,
    authService,
    authenticate,
    config,
  });

  return router;
}

type CollectionRegistration = {
  path: string;
  resource: ConfigurationResource;
  listSchema: ZodType<ParsedListValues>;
  createSchema: ZodType;
  service: SchoolConfigurationService;
  authService: AuthService;
  authenticate: RequestHandler;
  config: AppConfig;
};

function registerCollectionRoutes(router: Router, registration: CollectionRegistration): void {
  router.get(
    registration.path,
    registration.authenticate,
    validateRequest({ params: schoolParamsSchema, query: registration.listSchema }),
    requireSchoolPermission(registration.authService, configurationReadPermission),
    route(async (request, response) => {
      const values = registration.listSchema.parse(request.query);
      const query = toListQuery(registration.resource, values);
      const page = await registration.service.list(registration.resource, schoolId(request), query);
      response.json({
        data: page.items.map(serializeConfiguration),
        meta: { limit: query.limit, offset: query.offset, total: page.total },
      });
    }),
  );

  router.post(
    registration.path,
    registration.authenticate,
    requireCsrf(registration.config),
    validateRequest({ params: schoolParamsSchema, body: registration.createSchema }),
    requireSchoolPermission(registration.authService, configurationManagePermission),
    route(async (request, response) => {
      const actorUserId = authenticatedUserId(response);
      const data = registration.createSchema.parse(request.body);
      const input = createInput(
        registration.resource,
        schoolId(request),
        actorUserId,
        requestId(response),
        data,
      );
      const record = await registration.service.create(input);
      response.status(201).json({ data: serializeConfiguration(record) });
    }),
  );
}

type ItemRegistration = {
  path: string;
  resource: ConfigurationResource;
  updateSchema?: ZodType;
  service: SchoolConfigurationService;
  authService: AuthService;
  authenticate: RequestHandler;
  config: AppConfig;
};

function registerItemRoutes(router: Router, registration: ItemRegistration): void {
  const path = `${registration.path}/:id`;
  router.get(
    path,
    registration.authenticate,
    validateRequest({ params: idParamsSchema }),
    requireSchoolPermission(registration.authService, configurationReadPermission),
    route(async (request, response) => {
      const record = await registration.service.getRecord(
        registration.resource,
        schoolId(request),
        recordId(request),
      );
      response.json({ data: serializeConfiguration(record) });
    }),
  );

  if (registration.updateSchema) {
    router.patch(
      path,
      registration.authenticate,
      requireCsrf(registration.config),
      validateRequest({ params: idParamsSchema, body: registration.updateSchema }),
      requireSchoolPermission(registration.authService, configurationManagePermission),
      route(async (request, response) => {
        const data = registration.updateSchema?.parse(request.body) as Record<string, unknown>;
        const input = updateInput(
          registration.resource,
          schoolId(request),
          recordId(request),
          authenticatedUserId(response),
          requestId(response),
          data,
        );
        const record = await registration.service.update(input);
        response.json({ data: serializeConfiguration(record) });
      }),
    );
  }

  router.post(
    `${path}/deactivate`,
    registration.authenticate,
    requireCsrf(registration.config),
    validateRequest({ params: deactivateParamsSchema }),
    requireSchoolPermission(registration.authService, configurationManagePermission),
    route(async (request, response) => {
      await registration.service.deactivate({
        resource: registration.resource,
        id: recordId(request),
        schoolId: schoolId(request),
        actorUserId: authenticatedUserId(response),
        requestId: requestId(response),
      });
      response.status(204).end();
    }),
  );
}

function toListQuery(
  resource: ConfigurationResource,
  values: ParsedListValues,
): ConfigurationListQuery {
  const parentId = values.academicYearId ?? values.classId;
  return {
    limit: values.limit,
    offset: values.offset,
    sortBy: values.sortBy,
    sortOrder: values.sortOrder,
    ...(values.status ? { status: values.status } : {}),
    ...(values.q ? { search: values.q } : {}),
    ...(["terms", "classes", "streams", "classSubjects"].includes(resource) && parentId
      ? { parentId }
      : {}),
  };
}

function createInput(
  resource: ConfigurationResource,
  schoolIdValue: string,
  actorUserId: string,
  requestIdValue: string,
  data: unknown,
) {
  const audit = { schoolId: schoolIdValue, actorUserId, requestId: requestIdValue };
  switch (resource) {
    case "academicYears":
      return { ...audit, resource, data: periodCreateSchema.parse(data) };
    case "terms":
      return { ...audit, resource, data: termCreateSchema.parse(data) };
    case "classes":
      return { ...audit, resource, data: classCreateSchema.parse(data) };
    case "streams":
      return { ...audit, resource, data: streamCreateSchema.parse(data) };
    case "subjects":
      return { ...audit, resource, data: namedCreateSchema.parse(data) };
    case "classSubjects":
      return { ...audit, resource, data: classSubjectCreateSchema.parse(data) };
  }
}

function updateInput(
  resource: ConfigurationResource,
  schoolIdValue: string,
  id: string,
  actorUserId: string,
  requestIdValue: string,
  data: Record<string, unknown>,
) {
  const audit = { schoolId: schoolIdValue, id, actorUserId, requestId: requestIdValue };
  switch (resource) {
    case "academicYears":
    case "terms":
      return { ...audit, resource, data: periodUpdateSchema.parse(data) };
    case "classes":
    case "streams":
    case "subjects":
      return { ...audit, resource, data: namedUpdateSchema.parse(data) };
    case "classSubjects":
      throw new ApiError(405, "METHOD_NOT_ALLOWED", "Class-subject assignments cannot be edited.");
  }
}

function serializeSchoolProfile(profile: {
  id: string;
  name: string;
  contactEmail: string | null;
  contactPhone: string | null;
  status: string;
  updatedAt: Date;
}) {
  return { ...profile, updatedAt: profile.updatedAt.toISOString() };
}

function serializeConfiguration<
  T extends {
    createdAt: Date;
    updatedAt: Date;
    startsOn?: Date;
    endsOn?: Date;
  },
>(record: T) {
  return {
    ...record,
    ...(record.startsOn ? { startsOn: record.startsOn.toISOString().slice(0, 10) } : {}),
    ...(record.endsOn ? { endsOn: record.endsOn.toISOString().slice(0, 10) } : {}),
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

function schoolId(request: Request): string {
  const value = request.params["schoolId"];
  if (typeof value !== "string" || !value) {
    throw new ApiError(400, "INVALID_SCHOOL", "A school context is required.");
  }
  return value;
}

function recordId(request: Request): string {
  const value = request.params["id"];
  if (typeof value !== "string" || !value) {
    throw new ApiError(400, "INVALID_ID", "A record ID is required.");
  }
  return value;
}

function authenticatedUserId(response: Response): string {
  const userId = response.locals.auth?.user.id;
  if (!userId) throw new ApiError(401, "UNAUTHENTICATED", "Authentication is required.");
  return userId;
}

function requestId(response: Response): string {
  return response.getHeader("x-request-id")?.toString() ?? "unknown";
}

function route(handler: (request: Request, response: Response) => Promise<void>): RequestHandler {
  return (request, response, next) => {
    void handler(request, response).catch(next);
  };
}
