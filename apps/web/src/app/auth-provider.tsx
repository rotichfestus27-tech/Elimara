import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { type Query, useQueryClient } from "@tanstack/react-query";
import { ApiClientError, apiRequest, SESSION_EXPIRED_EVENT } from "@/lib/api/client";

export type CurrentUser = { id: string; email: string };
export type SchoolAccess = { id: string; name: string; permissions: string[] };

const SESSION_EXPIRED_MESSAGE = "Your session has expired. Sign in again.";

type AuthContextValue = {
  user: CurrentUser | null;
  schools: SchoolAccess[];
  school: SchoolAccess | null;
  loading: boolean;
  error: string | null;
  login(email: string, password: string): Promise<void>;
  logout(): Promise<void>;
  refreshAuth(): Promise<void>;
  selectSchool(schoolId: string): Promise<void>;
  updateSchoolName(schoolId: string, name: string): void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [schools, setSchools] = useState<SchoolAccess[]>([]);
  const [selectedSchoolId, setSelectedSchoolId] = useState(() =>
    sessionStorage.getItem("elimara_school_id"),
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const authRequestId = useRef(0);
  const schoolSelectionRequestId = useRef(0);
  const invalidateSchoolSelection = useCallback(() => {
    schoolSelectionRequestId.current += 1;
  }, []);

  const clearScopedQueries = useCallback(
    async (requestId: number): Promise<boolean> => {
      const isCurrentRequest = () => requestId === authRequestId.current;
      await queryClient.cancelQueries({ predicate: isScopedQuery });
      if (!isCurrentRequest()) return false;
      queryClient.removeQueries({ predicate: isScopedQuery });
      return true;
    },
    [queryClient],
  );

  const loadIdentity = useCallback(
    async (requestId: number): Promise<boolean> => {
      try {
        const identity = await apiRequest<{ data: { user: CurrentUser } }>("/auth/me");
        if (requestId !== authRequestId.current) return false;
        const memberships = await apiRequest<{ data: SchoolAccess[] }>("/auth/schools");
        if (requestId !== authRequestId.current) return false;
        setError(null);
        setUser(identity.data.user);
        setSchools(memberships.data);
        sessionStorage.setItem("elimara_session_active", "true");
        setSelectedSchoolId((current) => {
          const selected = memberships.data.find((school) => school.id === current);
          const next =
            selected?.id ?? (memberships.data.length === 1 ? memberships.data[0]?.id : null);
          if (next) sessionStorage.setItem("elimara_school_id", next);
          else sessionStorage.removeItem("elimara_school_id");
          return next;
        });
        setLoading(false);
        return true;
      } catch (requestError) {
        if (requestId === authRequestId.current) {
          if (!(await clearScopedQueries(requestId))) return false;
          const hadEstablishedSession =
            sessionStorage.getItem("elimara_session_active") === "true" ||
            Boolean(sessionStorage.getItem("elimara_school_id"));
          const sessionExpired =
            requestError instanceof ApiClientError && requestError.status === 401;
          invalidateSchoolSelection();
          setUser(null);
          setSchools([]);
          setSelectedSchoolId(null);
          sessionStorage.removeItem("elimara_school_id");
          if (sessionExpired) sessionStorage.removeItem("elimara_session_active");
          if (sessionExpired && hadEstablishedSession) {
            setError(SESSION_EXPIRED_MESSAGE);
          } else if (!sessionExpired) {
            setError("We couldn't verify your session. Check your connection and try again.");
          } else {
            setError(null);
          }
          setLoading(false);
        } else {
          return false;
        }
        return false;
      }
    },
    [clearScopedQueries, invalidateSchoolSelection],
  );

  useEffect(() => {
    const requestId = ++authRequestId.current;
    void loadIdentity(requestId);
  }, [loadIdentity]);

  useEffect(() => {
    const onSessionExpired = () => {
      const requestId = ++authRequestId.current;
      invalidateSchoolSelection();
      setLoading(true);
      void (async () => {
        if (!(await clearScopedQueries(requestId))) return;
        setUser(null);
        setSchools([]);
        setSelectedSchoolId(null);
        sessionStorage.removeItem("elimara_school_id");
        sessionStorage.removeItem("elimara_session_active");
        setError(SESSION_EXPIRED_MESSAGE);
        setLoading(false);
      })();
    };

    window.addEventListener(SESSION_EXPIRED_EVENT, onSessionExpired);
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, onSessionExpired);
  }, [clearScopedQueries, invalidateSchoolSelection]);

  async function refreshAuth() {
    const requestId = ++authRequestId.current;
    invalidateSchoolSelection();
    setLoading(true);
    if (!(await clearScopedQueries(requestId))) return;
    await loadIdentity(requestId);
  }

  async function login(email: string, password: string) {
    const requestId = ++authRequestId.current;
    invalidateSchoolSelection();
    setError(null);
    try {
      await apiRequest("/auth/login", { method: "POST", body: { email, password } });
      if (requestId !== authRequestId.current) return;
      sessionStorage.setItem("elimara_session_active", "true");
      if (!(await clearScopedQueries(requestId))) return;
      if (!(await loadIdentity(requestId)) && requestId === authRequestId.current) {
        throw new Error("Signed in, but school access could not be loaded. Try again.");
      }
    } catch (loginError) {
      if (requestId === authRequestId.current) {
        setUser(null);
        setSchools([]);
        setSelectedSchoolId(null);
        sessionStorage.removeItem("elimara_school_id");
        setLoading(false);
      }
      throw loginError;
    }
  }

  async function logout() {
    const requestId = ++authRequestId.current;
    invalidateSchoolSelection();
    try {
      await apiRequest("/auth/logout", { method: "POST" });
    } catch (logoutError) {
      if (logoutError instanceof ApiClientError && logoutError.status === 401) {
        if (!(await clearScopedQueries(requestId))) return;
        invalidateSchoolSelection();
        setUser(null);
        setSchools([]);
        setSelectedSchoolId(null);
        sessionStorage.removeItem("elimara_school_id");
        sessionStorage.removeItem("elimara_session_active");
        setError(SESSION_EXPIRED_MESSAGE);
        setLoading(false);
        return;
      }
      throw logoutError;
    }
    if (!(await clearScopedQueries(requestId))) return;
    setUser(null);
    setSchools([]);
    setSelectedSchoolId(null);
    sessionStorage.removeItem("elimara_school_id");
    sessionStorage.removeItem("elimara_session_active");
    setError(null);
    setLoading(false);
  }

  async function selectSchool(schoolId: string) {
    if (!schools.some((school) => school.id === schoolId)) return;
    if (schoolId === selectedSchoolId) return;
    const requestId = ++schoolSelectionRequestId.current;
    await queryClient.cancelQueries({ predicate: isSchoolQuery });
    if (requestId !== schoolSelectionRequestId.current) return;
    queryClient.removeQueries({ predicate: isSchoolQuery });
    sessionStorage.setItem("elimara_school_id", schoolId);
    setSelectedSchoolId(schoolId);
  }

  function updateSchoolName(schoolId: string, name: string) {
    setSchools((current) =>
      current.map((school) => (school.id === schoolId ? { ...school, name } : school)),
    );
  }

  const value = {
    user,
    schools,
    school: schools.find((school) => school.id === selectedSchoolId) ?? null,
    loading,
    error,
    login,
    logout,
    refreshAuth,
    selectSchool,
    updateSchoolName,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

function isScopedQuery(query: Query) {
  const [scope] = query.queryKey;
  return (
    typeof scope === "string" && (scope.startsWith("school-") || scope.startsWith("platform-"))
  );
}

function isSchoolQuery(query: Query) {
  return query.queryKey[0] === "school-data";
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside AuthProvider.");
  return value;
}
