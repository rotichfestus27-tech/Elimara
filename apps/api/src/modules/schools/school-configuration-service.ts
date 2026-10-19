import type {
  ConfigurationListQuery,
  ConfigurationPage,
  ConfigurationRecord,
  ConfigurationResource,
  CreateConfigurationInput,
  DeactivateConfigurationInput,
  SchoolConfigurationStore,
  SchoolProfileRecord,
  SchoolProfileUpdate,
  UpdateConfigurationInput,
} from "@elimara/database";
import { SchoolConfigurationStoreError } from "@elimara/database";
import { ApiError } from "../../http/errors/api-error.js";

export class SchoolConfigurationService {
  constructor(private readonly store: SchoolConfigurationStore) {}

  async getSchoolProfile(schoolId: string): Promise<SchoolProfileRecord> {
    const profile = await this.store.getSchoolProfile(schoolId);
    if (!profile) throw schoolNotFound();
    return profile;
  }

  async updateSchoolProfile(input: {
    schoolId: string;
    actorUserId: string;
    requestId: string;
    data: SchoolProfileUpdate;
  }): Promise<SchoolProfileRecord> {
    return this.run(async () => {
      const profile = await this.store.updateSchoolProfile(input);
      if (!profile) throw schoolNotFound();
      return profile;
    });
  }

  async list(
    resource: ConfigurationResource,
    schoolId: string,
    query: ConfigurationListQuery,
  ): Promise<ConfigurationPage> {
    if (query.parentId) {
      const parentResource =
        resource === "terms" || resource === "classes" ? "academicYears" : "classes";
      await this.getRecord(parentResource, schoolId, query.parentId);
    }
    return this.run(() => this.store.listConfiguration(resource, schoolId, query));
  }

  async getRecord(
    resource: ConfigurationResource,
    schoolId: string,
    id: string,
  ): Promise<ConfigurationRecord> {
    const record = await this.store.getConfiguration(resource, schoolId, id);
    if (!record) throw recordNotFound(resource);
    return record;
  }

  async create(input: CreateConfigurationInput): Promise<ConfigurationRecord> {
    return this.run(() => this.store.createConfiguration(input));
  }

  async update(input: UpdateConfigurationInput): Promise<ConfigurationRecord> {
    return this.run(async () => {
      const record = await this.store.updateConfiguration(input);
      if (!record) throw recordNotFound(input.resource);
      return record;
    });
  }

  async deactivate(input: DeactivateConfigurationInput): Promise<void> {
    return this.run(async () => {
      const outcome = await this.store.deactivateConfiguration(input);
      if (outcome === "NOT_FOUND") throw recordNotFound(input.resource);
    });
  }

  private async run<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (error instanceof SchoolConfigurationStoreError) {
        throw mapStoreError(error);
      }
      throw error;
    }
  }
}

function mapStoreError(error: SchoolConfigurationStoreError): ApiError {
  switch (error.code) {
    case "CONFIGURATION_CONFLICT":
      return new ApiError(409, error.code, error.message);
    case "CONCURRENT_CONFIGURATION_CHANGE":
    case "PARENT_INACTIVE":
    case "CONFIGURATION_INACTIVE":
      return new ApiError(409, error.code, error.message);
    case "SCHOOL_NOT_FOUND":
    case "PARENT_NOT_FOUND":
      return new ApiError(404, error.code, error.message);
    case "INVALID_RELATIONSHIP":
    case "INVALID_PERIOD":
      return new ApiError(400, error.code, error.message);
  }
}

function schoolNotFound(): ApiError {
  return new ApiError(404, "SCHOOL_NOT_FOUND", "The requested school was not found.");
}

function recordNotFound(resource: ConfigurationResource): ApiError {
  const label: Record<ConfigurationResource, string> = {
    academicYears: "academic year",
    terms: "term",
    classes: "class",
    streams: "stream",
    subjects: "subject",
    classSubjects: "class-subject assignment",
  };
  return new ApiError(404, "RECORD_NOT_FOUND", `The requested ${label[resource]} was not found.`);
}
