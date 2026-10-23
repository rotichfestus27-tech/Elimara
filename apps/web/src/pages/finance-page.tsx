import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { RequestError, RequestLoading } from "@/components/api/request-state";
import { useSchoolList } from "@/lib/api/school-data";

type FeeStructure = {
  id: string;
  name: string;
  academicYearId: string;
  termId: string;
  classId: string;
  status: "ACTIVE" | "INACTIVE";
  items: Array<{ id: string; name: string; amount: string }>;
};

type FinancialAccount = {
  accountId: string;
  studentId: string;
  admissionNumber: string;
  studentGivenName: string;
  studentFamilyName: string;
  outstandingCharges: string;
  unappliedCredit: string;
  balanceDue: string;
  netBalance: string;
};

type FinanceSection = "structures" | "accounts";

export function FinancePage() {
  const [section, setSection] = useState<FinanceSection>("accounts");
  const structures = useSchoolList<FeeStructure>("/finance/fee-structures", {
    limit: 100,
    offset: 0,
  }, { enabled: section === "structures" });
  const accounts = useSchoolList<FinancialAccount>("/finance/accounts", {
    limit: 100,
    offset: 0,
  }, { enabled: section === "accounts" });

  const columns = section === "structures"
    ? ["Fee structure", "Academic year", "Term", "Class", "Items", "Status"]
    : ["Admission number", "Student", "Outstanding charges", "Unapplied credit", "Balance due"];

  return (
    <div className="space-y-6">
      <section className="space-y-2">
        <p className="text-sm font-medium text-primary">School finance</p>
        <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">Finance</h2>
        <p className="text-sm leading-6 text-muted-foreground">
          Review configured fee structures and student account balances. Amounts are returned by the API as exact decimal strings.
        </p>
      </section>
      <div aria-label="Finance records" className="flex gap-1 border-b" role="tablist">
        {([
          ["accounts", "Student accounts"],
          ["structures", "Fee structures"],
        ] as const).map(([id, label]) => (
          <button
            aria-selected={section === id}
            className={`min-h-11 border-b-2 px-4 text-sm font-medium ${
              section === id ? "border-primary text-primary" : "border-transparent text-muted-foreground"
            }`}
            key={id}
            onClick={() => setSection(id)}
            role="tab"
            type="button"
          >
            {label}
          </button>
        ))}
      </div>
      <Card className="shadow-none">
        <CardContent className="space-y-4 p-4 sm:p-5">
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full min-w-[700px] border-collapse text-left text-sm">
              <thead className="bg-muted/50 text-xs text-muted-foreground">
                <tr>{columns.map((column) => <th className="px-4 py-3 font-medium" key={column}>{column}</th>)}</tr>
              </thead>
              <tbody>
                {section === "structures" ? (
                  structures.isPending ? (
                    <tr><td colSpan={columns.length}><RequestLoading /></td></tr>
                  ) : structures.isError ? (
                    <tr><td colSpan={columns.length}><RequestError error={structures.error} /></td></tr>
                  ) : structures.data.data.length === 0 ? (
                    <tr><td className="px-4 py-12 text-center text-sm text-muted-foreground" colSpan={columns.length}>No fee structures found.</td></tr>
                  ) : structures.data.data.map((item) => (
                    <tr className="border-t" key={item.id}>
                      <td className="px-4 py-3 font-medium">{item.name}</td>
                      <td className="px-4 py-3">{item.academicYearId}</td>
                      <td className="px-4 py-3">{item.termId}</td>
                      <td className="px-4 py-3">{item.classId}</td>
                      <td className="px-4 py-3">{item.items.length}</td>
                      <td className="px-4 py-3">{item.status.toLowerCase()}</td>
                    </tr>
                  ))
                ) : accounts.isPending ? (
                  <tr><td colSpan={columns.length}><RequestLoading /></td></tr>
                ) : accounts.isError ? (
                  <tr><td colSpan={columns.length}><RequestError error={accounts.error} /></td></tr>
                ) : accounts.data.data.length === 0 ? (
                  <tr><td className="px-4 py-12 text-center text-sm text-muted-foreground" colSpan={columns.length}>No financial accounts found.</td></tr>
                ) : accounts.data.data.map((account) => (
                  <tr className="border-t" key={account.accountId}>
                    <td className="px-4 py-3 font-medium">{account.admissionNumber}</td>
                    <td className="px-4 py-3">{account.studentGivenName} {account.studentFamilyName}</td>
                    <td className="px-4 py-3">KES {account.outstandingCharges}</td>
                    <td className="px-4 py-3">KES {account.unappliedCredit}</td>
                    <td className="px-4 py-3">KES {account.balanceDue}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {section === "structures" && !structures.isPending && !structures.isError && (
            <p className="text-xs text-muted-foreground">Showing {structures.data.data.length} of {structures.data.meta.total} fee structures.</p>
          )}
          {section === "accounts" && !accounts.isPending && !accounts.isError && (
            <p className="text-xs text-muted-foreground">Showing {accounts.data.data.length} of {accounts.data.meta.total} student accounts.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
