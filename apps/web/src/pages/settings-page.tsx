import { useEffect, useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { RequestError, RequestLoading } from "@/components/api/request-state";
import { useAuth } from "@/app/auth-provider";
import { apiRequest } from "@/lib/api/client";
import { useSchoolData } from "@/lib/api/school-data";

type SchoolProfile = {
  id: string;
  name: string;
  contactEmail: string | null;
  contactPhone: string | null;
  status: "ACTIVE" | "SUSPENDED" | "CLOSED";
  updatedAt: string;
};

export function SettingsPage() {
  const { school } = useAuth();
  const queryClient = useQueryClient();
  const profile = useSchoolData<{ data: SchoolProfile }>("");
  const [name, setName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!profile.data) return;
    setName(profile.data.data.name);
    setContactEmail(profile.data.data.contactEmail ?? "");
    setContactPhone(profile.data.data.contactPhone ?? "");
  }, [profile.data]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!school) return;
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const result = await apiRequest<{ data: SchoolProfile }>(`/schools/${encodeURIComponent(school.id)}`, {
        method: "PATCH",
        body: {
          name,
          contactEmail: contactEmail || null,
          contactPhone: contactPhone || null,
        },
      });
      queryClient.setQueryData(["school-data", school.id, "", ""], result);
      await profile.refetch();
      setSaved(true);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError : new Error("School profile could not be saved."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <section className="space-y-2">
        <p className="text-sm font-medium text-primary">Workspace controls</p>
        <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">School settings</h2>
        <p className="text-sm leading-6 text-muted-foreground">Manage the profile fields supported by the school configuration API.</p>
      </section>
      <Card className="max-w-2xl shadow-none">
        <CardContent className="p-4 sm:p-6">
          {profile.isPending ? (
            <RequestLoading />
          ) : profile.isError ? (
            <RequestError error={profile.error} />
          ) : (
            <form className="space-y-4" onSubmit={(event) => void save(event)}>
              <label className="block space-y-1.5 text-sm">
                <span className="text-xs font-medium text-muted-foreground">School name</span>
                <input className="h-10 w-full rounded-md border border-input bg-background px-3" maxLength={200} onChange={(event) => setName(event.target.value)} required value={name} />
              </label>
              <label className="block space-y-1.5 text-sm">
                <span className="text-xs font-medium text-muted-foreground">Contact email</span>
                <input className="h-10 w-full rounded-md border border-input bg-background px-3" maxLength={320} onChange={(event) => setContactEmail(event.target.value)} type="email" value={contactEmail} />
              </label>
              <label className="block space-y-1.5 text-sm">
                <span className="text-xs font-medium text-muted-foreground">Contact phone</span>
                <input className="h-10 w-full rounded-md border border-input bg-background px-3" maxLength={40} onChange={(event) => setContactPhone(event.target.value)} type="tel" value={contactPhone} />
              </label>
              {error && <RequestError error={error} />}
              {saved && <p className="text-sm text-green-700" role="status">School profile saved.</p>}
              <Button disabled={saving || !name.trim()} type="submit">
                {saving ? "Saving..." : "Save profile"}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
