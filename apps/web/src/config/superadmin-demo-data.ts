export type DemoSchoolStatus = "ACTIVE" | "SUSPENDED" | "CLOSED";

export type DemoSchool = {
  id: string;
  name: string;
  contactEmail: string | null;
  contactPhone: string | null;
  status: DemoSchoolStatus;
  createdAt: string;
};

export type NewDemoSchool = Pick<
  DemoSchool,
  "name" | "contactEmail" | "contactPhone"
>;

export const initialDemoSchools: DemoSchool[] = [
  {
    id: "demo-school-001",
    name: "Demo Northfield Academy",
    contactEmail: "office@northfield.example",
    contactPhone: "+254 700 000 001",
    status: "ACTIVE",
    createdAt: "2026-09-18T09:00:00.000Z",
  },
  {
    id: "demo-school-002",
    name: "Demo Lakeside School",
    contactEmail: "hello@lakeside.example",
    contactPhone: "+254 700 000 002",
    status: "SUSPENDED",
    createdAt: "2026-10-02T10:30:00.000Z",
  },
  {
    id: "demo-school-003",
    name: "Demo Cedar Grove Primary",
    contactEmail: null,
    contactPhone: null,
    status: "CLOSED",
    createdAt: "2026-10-14T08:15:00.000Z",
  },
];
