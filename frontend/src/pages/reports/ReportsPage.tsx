import { TrendingUp, FileText, CheckCircle, Users, AlertTriangle } from "lucide-react";
import { useReports } from "@/hooks/useSettings";
import { useDashboardStats } from "@/hooks/useDashboardStats";
import { StatCard } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { formatKES } from "@/lib/utils";
import type { InvoiceStatus, EtimsStatus } from "@/lib/types";

// ── Helpers ───────────────────────────────────────────────────────────────────
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
                "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function statusVariant(s: string): "green" | "yellow" | "red" | "gray" | "blue" {
  const m: Record<string, "green" | "yellow" | "red" | "gray" | "blue"> = {
    paid: "green", partial: "yellow", overdue: "red",
    draft: "gray", sent: "blue", cancelled: "gray",
  };
  return (m[s as InvoiceStatus]) ?? "gray";
}

function etimsVariant(s: string): "green" | "yellow" | "red" | "gray" | "blue" {
  const m: Record<string, "green" | "yellow" | "red" | "gray" | "blue"> = {
    accepted: "green", pending: "yellow", queued: "blue",
    submitted: "blue", rejected: "red", na: "gray",
  };
  return (m[s as EtimsStatus]) ?? "gray";
}

// ── Mini bar chart (CSS-only) ─────────────────────────────────────────────────
function BarChart({ data }: { data: { label: string; value: number; vat: number }[] }) {
  const max = Math.max(...data.map((d) => d.value), 1);
  return (
    <div className="flex items-end gap-2 h-32 w-full">
      {data.map((d) => {
        const height = Math.round((d.value / max) * 100);
        const vatHeight = Math.round((d.vat / max) * 100);
        return (
          <div key={d.label} className="flex-1 flex flex-col items-center gap-1 min-w-0">
            <div className="w-full flex flex-col justify-end" style={{ height: "112px" }}>
              <div className="relative w-full">
                {/* Revenue bar */}
                <div
                  className="w-full bg-brand-200 rounded-t-sm transition-all"
                  style={{ height: `${height}px` }}
                />
                {/* VAT overlay */}
                <div
                  className="absolute bottom-0 left-0 right-0 bg-brand-500 rounded-t-sm"
                  style={{ height: `${vatHeight}px` }}
                  title={`VAT: ${formatKES(d.vat)}`}
                />
              </div>
            </div>
            <span className="text-xs text-muted truncate w-full text-center">{d.label}</span>
          </div>
        );
      })}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function ReportsPage() {
  const { data, isLoading } = useReports();
  const { data: stats } = useDashboardStats();

  const monthly = data?.monthly_revenue ?? [];
  const totalRevenue = monthly.reduce((s, m) => s + parseFloat(m.total), 0);
  const totalVAT = monthly.reduce((s, m) => s + parseFloat(m.vat), 0);
  const totalInvoices = monthly.reduce((s, m) => s + m.count, 0);

  const chartData = monthly.map((m) => ({
    label: MONTHS[m.month - 1],
    value: parseFloat(m.total),
    vat: parseFloat(m.vat),
  }));

  return (
    <div className="space-y-6">
      <h1 className="page-title">Reports</h1>

      {/* Summary stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard
          label="Revenue (6 months)"
          value={formatKES(totalRevenue)}
          sub={`${totalInvoices} invoices`}
          icon={TrendingUp}
          trend="up"
        />
        <StatCard
          label="VAT Collected"
          value={formatKES(totalVAT)}
          sub="Output VAT (6 months)"
          icon={FileText}
          trend="up"
        />
        <StatCard
          label="eTIMS Accepted"
          value={String(stats?.etims_accepted_month ?? "—")}
          sub="This month"
          icon={CheckCircle}
          trend="up"
        />
        <StatCard
          label="Top Customers"
          value={String(data?.top_customers?.length ?? "—")}
          sub="By total invoiced"
          icon={Users}
          trend="neutral"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Revenue chart */}
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-text">Revenue — Last 6 Months</h2>
            <div className="flex items-center gap-3 text-xs text-muted">
              <span className="flex items-center gap-1">
                <span className="inline-block h-2.5 w-2.5 rounded-sm bg-brand-200" />
                Revenue
              </span>
              <span className="flex items-center gap-1">
                <span className="inline-block h-2.5 w-2.5 rounded-sm bg-brand-500" />
                VAT
              </span>
            </div>
          </div>
          {isLoading ? (
            <div className="h-32 bg-gray-100 rounded-lg animate-pulse" />
          ) : (
            <>
              <BarChart data={chartData} />
              <div className="mt-4 divide-y divide-border border-t border-border">
                {monthly.map((m) => (
                  <div
                    key={`${m.year}-${m.month}`}
                    className="flex items-center justify-between py-2 text-sm"
                  >
                    <span className="text-muted">
                      {MONTHS[m.month - 1]} {m.year}
                    </span>
                    <div className="flex items-center gap-6 tabular-nums">
                      <span className="text-muted text-xs">{m.count} inv</span>
                      <span className="text-xs text-brand-600">
                        VAT {formatKES(m.vat)}
                      </span>
                      <span className="font-medium">{formatKES(m.total)}</span>
                    </div>
                  </div>
                ))}
                {monthly.length > 0 && (
                  <div className="flex items-center justify-between py-2 text-sm font-semibold">
                    <span>Total</span>
                    <div className="flex items-center gap-6 tabular-nums">
                      <span className="text-xs text-muted">{totalInvoices} inv</span>
                      <span className="text-xs text-brand-600">{formatKES(totalVAT)}</span>
                      <span>{formatKES(totalRevenue)}</span>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* Top customers */}
        <div className="card">
          <h2 className="font-semibold text-text mb-4">Top Customers</h2>
          {isLoading ? (
            <div className="space-y-3">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="h-10 bg-gray-100 rounded-lg animate-pulse" />
              ))}
            </div>
          ) : !data?.top_customers?.length ? (
            <p className="text-sm text-muted text-center py-8">No data yet</p>
          ) : (
            <div className="space-y-2">
              {data.top_customers.map((c, i) => {
                const pct = totalRevenue > 0
                  ? Math.round((parseFloat(c.total) / totalRevenue) * 100)
                  : 0;
                return (
                  <div key={c.customer_name} className="group">
                    <div className="flex items-center justify-between text-sm mb-1">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-xs text-muted w-4 shrink-0">{i + 1}</span>
                        <span className="font-medium truncate">{c.customer_name}</span>
                        <span className="text-xs text-muted shrink-0">{c.count} inv</span>
                      </div>
                      <span className="font-semibold tabular-nums shrink-0 ml-2">
                        {formatKES(c.total)}
                      </span>
                    </div>
                    <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-brand-400 rounded-full"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Invoice status breakdown */}
        <div className="card">
          <h2 className="font-semibold text-text mb-4">Invoice Status Breakdown</h2>
          {isLoading ? (
            <div className="space-y-2">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="h-8 bg-gray-100 rounded animate-pulse" />
              ))}
            </div>
          ) : !data?.status_breakdown?.length ? (
            <p className="text-sm text-muted text-center py-8">No invoices yet</p>
          ) : (
            <div className="space-y-2">
              {data.status_breakdown.map((s) => (
                <div key={s.status} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                  <div className="flex items-center gap-3">
                    <Badge variant={statusVariant(s.status)}>{s.status}</Badge>
                    <span className="text-sm text-muted">{s.count} invoice{s.count !== 1 ? "s" : ""}</span>
                  </div>
                  <span className="text-sm font-medium tabular-nums">{formatKES(s.total)}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* eTIMS compliance */}
        <div className="card">
          <h2 className="font-semibold text-text mb-4">eTIMS Compliance</h2>
          {isLoading ? (
            <div className="space-y-2">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="h-8 bg-gray-100 rounded animate-pulse" />
              ))}
            </div>
          ) : !data?.etims_breakdown?.length ? (
            <p className="text-sm text-muted text-center py-8">No invoices yet</p>
          ) : (
            <div className="space-y-2">
              {data.etims_breakdown.map((e) => {
                const total = data.etims_breakdown.reduce((s, x) => s + x.count, 0);
                const pct = total > 0 ? Math.round((e.count / total) * 100) : 0;
                return (
                  <div key={e.etims_status}>
                    <div className="flex items-center justify-between text-sm mb-1">
                      <div className="flex items-center gap-2">
                        <Badge variant={etimsVariant(e.etims_status)}>{e.etims_status}</Badge>
                      </div>
                      <span className="tabular-nums text-muted">
                        {e.count} ({pct}%)
                      </span>
                    </div>
                    <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${
                          e.etims_status === "accepted"
                            ? "bg-compliant"
                            : e.etims_status === "rejected"
                            ? "bg-danger"
                            : "bg-brand-300"
                        }`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
              {/* Compliance rate */}
              {data.etims_breakdown.length > 0 && (() => {
                const accepted = data.etims_breakdown.find((e) => e.etims_status === "accepted")?.count ?? 0;
                const total = data.etims_breakdown.reduce((s, x) => s + x.count, 0);
                const rate = total > 0 ? Math.round((accepted / total) * 100) : 0;
                return (
                  <div className="mt-3 pt-3 border-t border-border flex items-center justify-between">
                    <span className="text-sm font-medium">KRA Compliance Rate</span>
                    <div className="flex items-center gap-2">
                      {rate >= 90 ? (
                        <CheckCircle className="h-4 w-4 text-compliant" />
                      ) : (
                        <AlertTriangle className="h-4 w-4 text-warning" />
                      )}
                      <span className={`font-bold text-sm ${rate >= 90 ? "text-compliant" : "text-warning"}`}>
                        {rate}%
                      </span>
                    </div>
                  </div>
                );
              })()}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
