import { ApiError } from "../../http/errors/api-error.js";

export function assertPermission(
  grantedPermissionKeys: readonly string[],
  requiredPermissionKey: string,
): void {
  if (!grantedPermissionKeys.includes(requiredPermissionKey)) {
    throw new ApiError(403, "FORBIDDEN", "You are not authorized to perform this action.");
  }
}

export function assertCanGrantPermissions(
  actorUserId: string,
  targetUserId: string,
  actorPermissionKeys: ReadonlySet<string>,
  requestedPermissionKeys: readonly string[],
): void {
  if (actorUserId === targetUserId) {
    throw new ApiError(403, "SELF_PRIVILEGE_ESCALATION", "You cannot change your own access.");
  }

  if (requestedPermissionKeys.some((permission) => !actorPermissionKeys.has(permission))) {
    throw new ApiError(
      403,
      "PERMISSION_GRANT_DENIED",
      "You cannot grant permissions you do not hold.",
    );
  }
}
