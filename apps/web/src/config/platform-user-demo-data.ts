export type PlatformUserDemoStatus = "ACTIVE" | "PENDING" | "SUSPENDED";

export type PlatformUserDemo = {
  id: string;
  name: string;
  email: string;
  roleLabel: string;
  status: PlatformUserDemoStatus;
  createdAt: string;
};

export type NewPlatformUserDemo = Pick<
  PlatformUserDemo,
  "name" | "email" | "roleLabel"
>;

export const platformUserDemoRoles = [
  "Demo label: Platform Super Admin",
  "Demo label: Platform Support",
  "Demo label: Read-only Analyst",
] as const;

export const initialPlatformUserDemos: PlatformUserDemo[] = [
  {
    id: "demo-platform-user-001",
    name: "Demo Platform Operator",
    email: "operator@example.test",
    roleLabel: platformUserDemoRoles[0],
    status: "ACTIVE",
    createdAt: "2026-10-04T09:00:00.000Z",
  },
  {
    id: "demo-platform-user-002",
    name: "Demo Support Reviewer",
    email: "reviewer@example.test",
    roleLabel: platformUserDemoRoles[1],
    status: "ACTIVE",
    createdAt: "2026-10-12T11:30:00.000Z",
  },
  {
    id: "demo-platform-user-003",
    name: "Demo Read-only Analyst",
    email: "analyst@example.test",
    roleLabel: platformUserDemoRoles[2],
    status: "SUSPENDED",
    createdAt: "2026-10-18T08:15:00.000Z",
  },
];
