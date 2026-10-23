import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { apiRequest } from "@/lib/api/client";

export type CurrentUser = { id: string; email: string };
export type SchoolAccess = { id: string; name: string; permissions: string[] };

type AuthContextValue = {
  user: CurrentUser | null;
  schools: SchoolAccess[];
  school: SchoolAccess | null;
  loading: boolean;
  error: string | null;
  login(email: string, password: string): Promise<void>;
  logout(): Promise<void>;
  selectSchool(schoolId: string): void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [schools, setSchools] = useState<SchoolAccess[]>([]);
  const [selectedSchoolId, setSelectedSchoolId] = useState(
    () => sessionStorage.getItem("elimara_school_id"),
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function loadIdentity(): Promise<boolean> {
    try {
      const identity = await apiRequest<{ data: { user: CurrentUser } }>("/auth/me");
      const memberships = await apiRequest<{ data: SchoolAccess[] }>("/auth/schools");
      setError(null);
      setUser(identity.data.user);
      setSchools(memberships.data);
      setSelectedSchoolId((current) => {
        const selected = memberships.data.find((school) => school.id === current);
        const next = selected?.id ?? (memberships.data.length === 1 ? memberships.data[0]?.id : null);
        if (next) sessionStorage.setItem("elimara_school_id", next);
        else sessionStorage.removeItem("elimara_school_id");
        return next;
      });
      return true;
    } catch (requestError) {
      setUser(null);
      setSchools([]);
      setSelectedSchoolId(null);
      sessionStorage.removeItem("elimara_school_id");
      if (requestError instanceof Error && "status" in requestError && requestError.status !== 401) {
        setError(requestError.message);
      } else {
        setError(null);
      }
      return false;
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadIdentity();
  }, []);

  async function login(email: string, password: string) {
    setError(null);
    await apiRequest("/auth/login", { method: "POST", body: { email, password } });
    if (!(await loadIdentity())) {
      throw new Error("Signed in, but school access could not be loaded. Try again.");
    }
  }

  async function logout() {
    await apiRequest("/auth/logout", { method: "POST" });
    setUser(null);
    setSchools([]);
    setSelectedSchoolId(null);
    sessionStorage.removeItem("elimara_school_id");
  }

  function selectSchool(schoolId: string) {
    if (!schools.some((school) => school.id === schoolId)) return;
    sessionStorage.setItem("elimara_school_id", schoolId);
    setSelectedSchoolId(schoolId);
  }

  const value = useMemo(
    () => ({
      user,
      schools,
      school: schools.find((school) => school.id === selectedSchoolId) ?? null,
      loading,
      error,
      login,
      logout,
      selectSchool,
    }),
    [user, schools, selectedSchoolId, loading, error],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside AuthProvider.");
  return value;
}
