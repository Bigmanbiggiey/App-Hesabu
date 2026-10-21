import { useNavigate } from "react-router-dom";
import {
  FileText,
  Smartphone,
  AlertTriangle,
  CheckCircle,
  TrendingUp,
  Clock,
} from "lucide-react";
import { StatCard, Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { useAuth } from "@/hooks/useAuth";
import { useDashboardStats } from "@/hooks/useDashboardStats";
import { useInvoices } from "@/hooks/useInvoices";
import { formatKES } from "@/lib/utils";
import type { InvoiceStatus, EtimsStatus } from "@/lib/types";

function statusVariant(s: InvoiceStatus): "green" | "yellow" | "red" | "gray" | "blue" {
  const m: Record<InvoiceStatus, "green" | "yellow" | "red" | "gray" | "blue"> = {
    paid: "green", partial: "yellow", overdue: "red",
    draft: "gray", sent: "blue", cancelled: "gray",
  };
  return m[s] ?? "gray";
}

function etimsVariant(s: EtimsStatus): "green" | "yellow" | "red" | "gray" | "blue" {
  const m: Record<EtimsStatus, "green" | "yellow" | "red" | "gray" | "blue"> = {
    accepted: "green", pending: "yellow", queued: "blue",
    submitted: "blue", rejected: "red", na: "gray",
  };
  return m[s] ?? "gray";
}

export default function DashboardPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { data: stats } = useDashboardStats();
  const { data: recentData, isLoading: invoicesLoading } = useInvoices({ page_size: "5" });

  const recentInvoices = recentData?.results ?? [];
  const hasEtimsSetup = !!user?.organization?.etims_device_serial;

  return (
    <div className="space-y-6">
      {/* Welcome */}
      <div>
        <h1 className="page-title">
          Habari, {user?.first_name} 👋
        </h1>
        <p className="text-sm text-muted mt-1">
          Here's your compliance overview for today
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard
          label="Pending eTIMS"
          value={stats ? String(stats.etims_pending) : "—"}
          sub="Awaiting KRA submission"
          icon={Clock}
          trend={stats && stats.etims_pending > 0 ? "down" : "neutral"}
        />
        <StatCard
          label="eTIMS Accepted"
          value={stats ? String(stats.etims_accepted_month) : "—"}
          sub="This month"
          icon={CheckCircle}
          trend="up"
        />
        <StatCard
          label="Unallocated M-Pesa"
          value={stats ? String(stats.unallocated_mpesa) : "—"}
          sub={stats?.unallocated_mpesa ? "Need manual review" : "All clear"}
          icon={Smartphone}
          trend={stats && stats.unallocated_mpesa > 0 ? "down" : "up"}
        />
        <StatCard
          label="Total Invoiced"
          value={stats ? formatKES(stats.month_invoiced) : "—"}
          sub={`${stats?.month_invoice_count ?? 0} invoices this month`}
          icon={TrendingUp}
          trend="up"
        />
      </div>

      {/* eTIMS setup alert */}
      {!hasEtimsSetup && (
        <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-4 flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-yellow-600 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-yellow-800">
              Connect your eTIMS credentials to start submitting invoices to KRA
            </p>
            <p className="text-xs text-yellow-700 mt-0.5">
              Go to Settings → eTIMS Setup to add your KRA PIN and device serial number.
            </p>
          </div>
          <Button variant="secondary" size="sm" onClick={() => navigate("/settings")}>
            Set up
          </Button>
        </div>
      )}

      {/* Overdue alert */}
      {stats && stats.overdue_invoices > 0 && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-red-600 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-red-800">
              {stats.overdue_invoices} overdue invoice{stats.overdue_invoices > 1 ? "s" : ""}
            </p>
            <p className="text-xs text-red-700 mt-0.5">
              Follow up with customers to collect outstanding payments.
            </p>
          </div>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => navigate("/invoices?status=overdue")}
          >
            View
          </Button>
        </div>
      )}

      <div className="grid grid-cols-1 2xl:grid-cols-2 gap-6">
        {/* Recent Invoices */}
        <Card
          title="Recent Invoices"
          action={
            <Button variant="ghost" size="sm" onClick={() => navigate("/invoices")}>
              View all
            </Button>
          }
        >
          {invoicesLoading ? (
            <div className="space-y-3">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="h-10 bg-gray-100 rounded-lg animate-pulse" />
              ))}
            </div>
          ) : !recentInvoices.length ? (
            <div className="flex flex-col items-center py-8 text-muted">
              <FileText className="h-10 w-10 mb-2 opacity-40" />
              <p className="text-sm">No invoices yet</p>
              <Button
                variant="secondary"
                size="sm"
                className="mt-3"
                onClick={() => navigate("/invoices/new")}
              >
                Create first invoice
              </Button>
            </div>
          ) : (
            <div className="table-wrapper -mx-4 -mb-4 mt-2 sm:-mx-6 sm:-mb-6">
              <table className="table">
                <thead>
                  <tr>
                    <th>Invoice</th>
                    <th>Customer</th>
                    <th className="text-right">Amount</th>
                    <th>Status</th>
                    <th>eTIMS</th>
                  </tr>
                </thead>
                <tbody>
                  {recentInvoices.map((inv) => (
                    <tr
                      key={inv.id}
                      className="cursor-pointer"
                      onClick={() => navigate(`/invoices/${inv.id}`)}
                    >
                      <td data-label="Invoice" className="font-mono text-xs font-medium text-brand-700">
                        {inv.invoice_number}
                      </td>
                      <td data-label="Customer" className="font-medium text-sm">{inv.customer_name}</td>
                      <td data-label="Amount" className="text-sm text-right tabular-nums">
                        {formatKES(inv.total_amount)}
                      </td>
                      <td data-label="Status">
                        <Badge variant={statusVariant(inv.status as InvoiceStatus)}>
                          {inv.status}
                        </Badge>
                      </td>
                      <td data-label="eTIMS">
                        <Badge variant={etimsVariant(inv.etims_status as EtimsStatus)}>
                          {inv.etims_status}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        {/* eTIMS Rejected / Pending action */}
        <Card title="eTIMS Action Required">
          {!stats || (stats.etims_pending === 0 && stats.etims_rejected === 0) ? (
            <div className="flex flex-col items-center py-8 text-muted">
              <CheckCircle className="h-10 w-10 mb-2 text-compliant opacity-60" />
              <p className="text-sm font-medium text-compliant">All invoices submitted</p>
              <p className="text-xs mt-1">No pending or rejected eTIMS submissions</p>
            </div>
          ) : (
            <div className="space-y-3">
              {stats.etims_pending > 0 && (
                <div
                  className="flex items-center justify-between p-3 rounded-lg border border-yellow-200 bg-yellow-50 cursor-pointer hover:border-yellow-300"
                  onClick={() => navigate("/invoices?etims_status=pending")}
                >
                  <div className="flex items-center gap-3">
                    <Clock className="h-4 w-4 text-yellow-600" />
                    <div>
                      <p className="text-sm font-medium text-yellow-800">
                        {stats.etims_pending} pending submission{stats.etims_pending > 1 ? "s" : ""}
                      </p>
                      <p className="text-xs text-yellow-700">Not yet sent to KRA</p>
                    </div>
                  </div>
                  <Button variant="secondary" size="sm">Submit</Button>
                </div>
              )}
              {stats.etims_rejected > 0 && (
                <div
                  className="flex items-center justify-between p-3 rounded-lg border border-red-200 bg-red-50 cursor-pointer hover:border-red-300"
                  onClick={() => navigate("/invoices?etims_status=rejected")}
                >
                  <div className="flex items-center gap-3">
                    <AlertTriangle className="h-4 w-4 text-red-600" />
                    <div>
                      <p className="text-sm font-medium text-red-800">
                        {stats.etims_rejected} rejected by KRA
                      </p>
                      <p className="text-xs text-red-700">Review and resubmit</p>
                    </div>
                  </div>
                  <Button variant="secondary" size="sm">Review</Button>
                </div>
              )}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
