import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/app/auth-provider";
import { apiRequest } from "@/lib/api/client";

export type ApiPage<T> = {
  data: T[];
  meta: { limit: number; offset: number; total: number };
};

function schoolUrl(schoolId: string | undefined, path: string, query: Record<string, string | number | undefined>) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== "") search.set(key, String(value));
  }
  const queryString = search.toString();
  return `/schools/${encodeURIComponent(schoolId ?? "")}${path}${queryString ? `?${queryString}` : ""}`;
}

export function useSchoolData<T>(
  path: string,
  query: Record<string, string | number | undefined> = {},
  options: { enabled?: boolean } = {},
) {
  const { school } = useAuth();
  const url = schoolUrl(school?.id, path, query);
  const queryString = new URL(url, "http://local").search;

  return useQuery({
    queryKey: ["school-data", school?.id, path, queryString],
    queryFn: () => apiRequest<T>(url),
    enabled: Boolean(school) && (options.enabled ?? true),
  });
}

export function useSchoolList<T>(
  path: string,
  query: Record<string, string | number | undefined> = {},
  options: { enabled?: boolean } = {},
) {
  return useSchoolData<ApiPage<T>>(path, query, options);
}
