import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, FileText, Search } from "lucide-react";
import { useInvoices } from "@/hooks/useInvoices";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { formatKES, formatDate } from "@/lib/utils";
import type { InvoiceStatus, EtimsStatus } from "@/lib/types";

const STATUS_FILTERS = [
  { label: "All", value: "" },
  { label: "Draft", value: "draft" },
  { label: "Sent", value: "sent" },
  { label: "Paid", value: "paid" },
  { label: "Overdue", value: "overdue" },
] as const;

const ETIMS_FILTERS = [
  { label: "All eTIMS", value: "" },
  { label: "Pending", value: "pending" },
  { label: "Accepted", value: "accepted" },
  { label: "Rejected", value: "rejected" },
] as const;

function statusVariant(s: InvoiceStatus) {
  const map: Record<InvoiceStatus, "green" | "yellow" | "red" | "gray" | "blue"> = {
    paid: "green", partial: "yellow", overdue: "red",
    draft: "gray", sent: "blue", cancelled: "gray",
  };
  return map[s] ?? "gray";
}

function etimsVariant(s: EtimsStatus) {
  const map: Record<EtimsStatus, "green" | "yellow" | "red" | "gray" | "blue"> = {
    accepted: "green", pending: "yellow", queued: "blue",
    submitted: "blue", rejected: "red", na: "gray",
  };
  return map[s] ?? "gray";
}

export default function InvoicesPage() {
  const navigate = useNavigate();
  const [statusFilter, setStatusFilter] = useState("");
  const [etimsFilter, setEtimsFilter] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const params: Record<string, string> = { page: String(page) };
  if (statusFilter) params.status = statusFilter;
  if (etimsFilter) params.etims_status = etimsFilter;

  const { data, isLoading } = useInvoices(params);

  const invoices = data?.results ?? [];

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="page-header">
        <h1 className="page-title">Invoices</h1>
        <Button onClick={() => navigate("/invoices/new")}>
          <Plus className="h-4 w-4" />
          New Invoice
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        {/* Search */}
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted pointer-events-none" />
          <input
            className="input pl-9"
            placeholder="Search invoice or customer…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {/* Status pills */}
        <div className="flex gap-1.5 flex-wrap">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.value}
              onClick={() => { setStatusFilter(f.value); setPage(1); }}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                statusFilter === f.value
                  ? "bg-brand-600 text-white"
                  : "bg-white border border-border text-muted hover:border-brand-300 hover:text-brand-700"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* eTIMS pills */}
        <div className="flex gap-1.5 flex-wrap">
          {ETIMS_FILTERS.map((f) => (
            <button
              key={f.value}
              onClick={() => { setEtimsFilter(f.value); setPage(1); }}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                etimsFilter === f.value
                  ? "bg-brand-600 text-white"
                  : "bg-white border border-border text-muted hover:border-brand-300 hover:text-brand-700"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="card p-0 overflow-hidden">
        {isLoading ? (
          <div className="space-y-0 divide-y divide-border">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="flex gap-4 px-4 py-3.5 animate-pulse">
                <div className="h-4 bg-gray-100 rounded w-24" />
                <div className="h-4 bg-gray-100 rounded flex-1" />
                <div className="h-4 bg-gray-100 rounded w-20" />
              </div>
            ))}
          </div>
        ) : invoices.length === 0 ? (
          <EmptyState
            icon={FileText}
            title="No invoices yet"
            description="Create your first invoice to start submitting to KRA eTIMS automatically."
            action={{ label: "Create Invoice", onClick: () => navigate("/invoices/new") }}
          />
        ) : (
          <>
            <div className="table-wrapper border-0 rounded-none">
              <table className="table">
                <thead>
                  <tr>
                    <th>Invoice</th>
                    <th>Customer</th>
                    <th>Date</th>
                    <th className="text-right">Amount</th>
                    <th className="text-right">Due</th>
                    <th>Status</th>
                    <th>eTIMS</th>
                  </tr>
                </thead>
                <tbody>
                  {invoices
                    .filter((inv) =>
                      search
                        ? inv.invoice_number.toLowerCase().includes(search.toLowerCase()) ||
                          inv.customer_name.toLowerCase().includes(search.toLowerCase())
                        : true
                    )
                    .map((inv) => (
                      <tr
                        key={inv.id}
                        className="cursor-pointer"
                        onClick={() => navigate(`/invoices/${inv.id}`)}
                      >
                        <td className="font-mono text-xs font-medium text-brand-700">
                          {inv.invoice_number}
                        </td>
                        <td className="font-medium">{inv.customer_name}</td>
                        <td className="text-muted text-xs">
                          {formatDate(inv.invoice_date)}
                        </td>
                        <td className="text-right font-medium tabular-nums">
                          {formatKES(inv.total_amount)}
                        </td>
                        <td className="text-right tabular-nums text-sm">
                          {formatKES(inv.amount_due)}
                        </td>
                        <td>
                          <Badge variant={statusVariant(inv.status)}>
                            {inv.status}
                          </Badge>
                        </td>
                        <td>
                          <Badge variant={etimsVariant(inv.etims_status)}>
                            {inv.etims_status}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {(data?.count ?? 0) > 25 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-border">
                <p className="text-sm text-muted">
                  {data?.count} invoices total
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={!data?.previous}
                    onClick={() => setPage((p) => p - 1)}
                  >
                    Previous
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={!data?.next}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    Next
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
