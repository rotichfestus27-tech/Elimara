import type { ReactNode } from "react";
import { Link } from "react-router";
import { cn } from "@/lib/utils";

export type BreadcrumbItem = { label: string; href?: string };

export function Breadcrumbs({ items }: { items: BreadcrumbItem[] }) {
  return (
    <nav aria-label="Breadcrumb">
      <ol className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        {items.map((item, index) => (
          <li className="flex items-center gap-2" key={item.href ?? item.label}>
            {index > 0 && <span aria-hidden="true">/</span>}
            {item.href && index < items.length - 1 ? (
              <Link className="hover:text-foreground" to={item.href}>{item.label}</Link>
            ) : (
              <span aria-current={index === items.length - 1 ? "page" : undefined}>
                {item.label}
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}

export function DashboardPageHeading({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
      <div className="space-y-2">
        {eyebrow && <p className="text-sm font-medium text-primary">{eyebrow}</p>}
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h1>
        {description && <p className="max-w-3xl text-sm leading-6 text-muted-foreground">{description}</p>}
      </div>
      {actions}
    </header>
  );
}

export function DashboardDataTable({
  caption,
  headers,
  children,
  className,
}: {
  caption: string;
  headers: string[];
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      aria-label={`Scrollable table: ${caption}`}
      className={cn(
        "overflow-x-auto rounded-lg border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        className,
      )}
      // biome-ignore lint/a11y/noNoninteractiveTabindex: Keyboard users need to scroll this overflow region.
      tabIndex={0}
    >
      <table className="w-full border-collapse text-left text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead className="bg-muted/50 text-xs text-muted-foreground">
          <tr>
            {headers.map((header) => (
              <th className="px-4 py-3 font-medium" key={header} scope="col">{header}</th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </section>
  );
}

export function DashboardSearchField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange(value: string): void;
  placeholder?: string;
}) {
  return (
    <label className="block space-y-1.5 text-sm">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <input
        className="h-10 w-full rounded-md border border-input bg-background px-3"
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        type="search"
        value={value}
      />
    </label>
  );
}

export function DashboardLoadingSkeleton({ rows = 3 }: { rows?: number }) {
  const rowCount = Math.max(1, rows);

  return (
    <div aria-label="Loading dashboard data" aria-busy="true" className="space-y-3" role="status">
      <div
        aria-hidden="true"
        className="animate-pulse rounded-md"
        style={{
          backgroundImage:
            "repeating-linear-gradient(to bottom, var(--muted) 0 3rem, transparent 3rem 3.75rem)",
          height: `${rowCount * 3.75 - 0.75}rem`,
        }}
      />
    </div>
  );
}

export function DashboardBarChart({
  title,
  values,
}: {
  title: string;
  values: Array<{ label: string; value: number }>;
}) {
  const max = Math.max(1, ...values.map((item) => Math.max(0, item.value)));
  return (
    <figure aria-label={title} className="space-y-3">
      <figcaption className="text-sm font-semibold">{title}</figcaption>
      <ul className="space-y-2">
        {values.map((item) => (
          <li className="grid grid-cols-[minmax(5rem,auto)_1fr_auto] items-center gap-3 text-sm" key={item.label}>
            <span className="truncate">{item.label}</span>
            <span aria-hidden="true" className="h-2 overflow-hidden rounded-full bg-muted">
              <span
                className="block h-full rounded-full bg-primary"
                style={{ width: `${Math.max(0, Math.min(100, (item.value / max) * 100))}%` }}
              />
            </span>
            <span className="tabular-nums">{item.value}</span>
          </li>
        ))}
      </ul>
      {values.length === 0 && (
        <p className="text-sm text-muted-foreground">No chart data is available.</p>
      )}
    </figure>
  );
}
