import { UserRound } from "lucide-react";
import { useMemo, useState } from "react";
import { DashboardDataTable } from "@/components/dashboard/dashboard-primitives";
import { PageHeader } from "@/components/layout/page-header";
import { AddPlatformUserSheet } from "@/components/superadmin/add-platform-user-sheet";
import { PlatformUserDetailsSheet } from "@/components/superadmin/platform-user-details-sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/data-states";
import {
  initialPlatformUserDemos,
  type NewPlatformUserDemo,
  type PlatformUserDemo,
  type PlatformUserDemoStatus,
} from "@/config/platform-user-demo-data";

const demoStatuses: PlatformUserDemoStatus[] = ["ACTIVE", "PENDING", "SUSPENDED"];

function statusVariant(status: PlatformUserDemoStatus) {
  return status === "ACTIVE" ? "secondary" : "outline";
}

export function PlatformUsersPage() {
  const [users, setUsers] = useState(initialPlatformUserDemos);
  const [searchText, setSearchText] = useState("");
  const [statusFilter, setStatusFilter] = useState<PlatformUserDemoStatus | "all">("all");
  const [selectedUser, setSelectedUser] = useState<PlatformUserDemo | null>(null);
  const [actionNotice, setActionNotice] = useState("");

  const filteredUsers = useMemo(() => {
    const search = searchText.trim().toLocaleLowerCase();
    return users.filter((user) => {
      const matchesSearch =
        !search ||
        user.name.toLocaleLowerCase().includes(search) ||
        user.email.toLocaleLowerCase().includes(search);
      return matchesSearch && (statusFilter === "all" || user.status === statusFilter);
    });
  }, [searchText, statusFilter, users]);

  function addDemoUser(input: NewPlatformUserDemo) {
    const user: PlatformUserDemo = {
      ...input,
      id: `demo-platform-user-${Date.now()}`,
      status: "PENDING",
      createdAt: new Date().toISOString(),
    };
    setUsers((current) => [user, ...current]);
    setSearchText("");
    setStatusFilter("all");
    setActionNotice(
      "Preview entry added for this page session only. No account was created and no invitation was sent.",
    );
  }

  return (
    <div className="space-y-6 sm:space-y-8">
      <PageHeader
        actions={<AddPlatformUserSheet onAdd={addDemoUser} />}
        description="Review isolated demonstration entries for the proposed platform-user workflow. The platform API does not provide a user directory or invitation endpoint."
        eyebrow={<Badge variant="outline">Preview only · no server data</Badge>}
        title="Platform user preview"
      />

      <section
        aria-label="Platform user preview notice"
        className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-4 text-sm leading-6"
      >
        <p className="font-semibold">Demonstration workspace</p>
        <p className="mt-1 text-muted-foreground">
          All rows and status labels below are mock data held only in this page session. They do not
          represent real users, platform roles, or permissions. Adding a preview entry does not
          create an account or send an invitation.
        </p>
      </section>

      {actionNotice && (
        <p className="rounded-md border bg-muted/40 p-3 text-sm" role="status">
          {actionNotice}
        </p>
      )}

      <Card className="shadow-none">
        <CardContent className="space-y-5 p-4 sm:p-5">
          <div className="grid gap-3 sm:grid-cols-[minmax(220px,1fr)_220px]">
            <label className="space-y-1.5">
              <span className="text-xs font-medium text-muted-foreground">
                Search preview entries
              </span>
              <input
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                onChange={(event) => setSearchText(event.target.value)}
                placeholder="Search name or email"
                type="search"
                value={searchText}
              />
            </label>
            <label className="space-y-1.5">
              <span className="text-xs font-medium text-muted-foreground">Demo status</span>
              <select
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                onChange={(event) => {
                  const value = event.target.value;
                  setStatusFilter(demoStatuses.find((status) => status === value) ?? "all");
                }}
                value={statusFilter}
              >
                <option value="all">All demo statuses</option>
                {demoStatuses.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {filteredUsers.length === 0 ? (
            <EmptyState
              className="min-h-48 justify-center"
              description={
                users.length === 0
                  ? "There are no preview entries in this page session."
                  : "No demonstration entries match these filters."
              }
              title={users.length === 0 ? "No preview entries" : "No matching entries"}
            />
          ) : (
            <DashboardDataTable
              caption="Demonstration platform-user entries; not server records"
              headers={["Preview user", "Email", "Demo role label", "Demo status", "Details"]}
            >
              {filteredUsers.map((user) => (
                <tr className="border-t" key={user.id}>
                  <th className="px-4 py-3 text-left font-medium" scope="row">
                    <span className="flex items-center gap-2">
                      <UserRound aria-hidden="true" className="size-4 text-muted-foreground" />
                      {user.name}
                    </span>
                  </th>
                  <td className="max-w-64 break-all px-4 py-3 text-muted-foreground">
                    {user.email}
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant="outline">{user.roleLabel}</Badge>
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={statusVariant(user.status)}>{user.status} · demo</Badge>
                  </td>
                  <td className="px-4 py-3">
                    <Button
                      aria-label={`View preview details for ${user.name}`}
                      onClick={() => setSelectedUser(user)}
                      size="sm"
                      variant="outline"
                    >
                      View preview
                    </Button>
                  </td>
                </tr>
              ))}
            </DashboardDataTable>
          )}

          <p aria-live="polite" className="border-t pt-4 text-xs text-muted-foreground">
            Showing {filteredUsers.length} of {users.length} page-session preview entries.
          </p>
        </CardContent>
      </Card>

      <PlatformUserDetailsSheet
        onOpenChange={(open) => {
          if (!open) setSelectedUser(null);
        }}
        user={selectedUser}
      />
    </div>
  );
}
