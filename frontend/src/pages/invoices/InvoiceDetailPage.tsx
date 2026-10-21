import { useParams, useNavigate } from "react-router-dom";
import {
  ChevronLeft, Download, Send, RefreshCw,
  CheckCircle, XCircle, Clock, Loader2, QrCode,
} from "lucide-react";
import { useInvoice, useSubmitToEtims } from "@/hooks/useInvoices";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { formatKES, formatDate } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import type { EtimsStatus, InvoiceStatus } from "@/lib/types";

// ── eTIMS status display ───────────────────────────────────────────────────────
function EtimsStatusCard({
  status,
  cuSerial,
  receiptNumber,
  qrCode,
  submittedAt,
  invoiceId,
}: {
  status: EtimsStatus;
  cuSerial: string;
  receiptNumber: string;
  qrCode: string;
  submittedAt: string | null;
  invoiceId: string;
}) {
  const { mutate: submitToEtims, isPending } = useSubmitToEtims();

  const configs: Record<EtimsStatus, { icon: React.ReactNode; title: string; desc: string; color: string }> = {
    pending: {
      icon: <Clock className="h-5 w-5 text-warning" />,
      title: "Pending Submission",
      desc: "This invoice has not been submitted to KRA eTIMS yet.",
      color: "border-yellow-200 bg-yellow-50",
    },
    queued: {
      icon: <Loader2 className="h-5 w-5 text-info animate-spin" />,
      title: "Queued for Submission",
      desc: "In the submission queue. This usually takes under a minute.",
      color: "border-blue-200 bg-blue-50",
    },
    submitted: {
      icon: <Loader2 className="h-5 w-5 text-info animate-spin" />,
      title: "Awaiting KRA Response",
      desc: "Invoice submitted — waiting for KRA to confirm.",
      color: "border-blue-200 bg-blue-50",
    },
    accepted: {
      icon: <CheckCircle className="h-5 w-5 text-compliant" />,
      title: "Accepted by KRA ✓",
      desc: "This invoice is KRA-compliant and legally valid.",
      color: "border-green-200 bg-green-50",
    },
    rejected: {
      icon: <XCircle className="h-5 w-5 text-danger" />,
      title: "Rejected by KRA",
      desc: "KRA rejected this submission. Review and resubmit.",
      color: "border-red-200 bg-red-50",
    },
    na: {
      icon: <Clock className="h-5 w-5 text-muted" />,
      title: "Not Applicable",
      desc: "eTIMS does not apply to this invoice.",
      color: "border-border bg-gray-50",
    },
  };

  const c = configs[status] ?? configs.pending;
  const canSubmit = status === "pending" || status === "rejected";

  return (
    <div className={`rounded-card border p-4 ${c.color}`}>
      <div className="flex items-start gap-3">
        {c.icon}
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm text-text">{c.title}</p>
          <p className="text-xs text-muted mt-0.5">{c.desc}</p>

          {status === "accepted" && (
            <div className="mt-3 space-y-1 text-xs font-mono text-text">
              {cuSerial && <p>SCU Serial: <span className="text-brand-700">{cuSerial}</span></p>}
              {receiptNumber && <p>Receipt No: <span className="text-brand-700">{receiptNumber}</span></p>}
              {submittedAt && <p className="text-muted">Submitted: {formatDate(submittedAt)}</p>}
            </div>
          )}

          {qrCode && status === "accepted" && (
            <div className="mt-3 flex items-center gap-2">
              <QrCode className="h-4 w-4 text-brand-600" />
              <span className="text-xs text-brand-700 font-medium">KRA QR Code attached to PDF</span>
            </div>
          )}

          {canSubmit && (
            <Button
              size="sm"
              variant={status === "rejected" ? "danger" : "primary"}
              loading={isPending}
              onClick={() => submitToEtims(invoiceId)}
              className="mt-3"
            >
              <Send className="h-3.5 w-3.5" />
              {status === "rejected" ? "Retry Submission" : "Submit to KRA"}
            </Button>
          )}

          {(status === "queued" || status === "submitted") && (
            <Button
              size="sm"
              variant="secondary"
              onClick={() => window.location.reload()}
              className="mt-3"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Refresh Status
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Status badge helpers ───────────────────────────────────────────────────────
function statusVariant(s: InvoiceStatus): "green" | "yellow" | "red" | "gray" | "blue" {
  const m: Record<InvoiceStatus, "green" | "yellow" | "red" | "gray" | "blue"> = {
    paid: "green", partial: "yellow", overdue: "red",
    draft: "gray", sent: "blue", cancelled: "gray",
  };
  return m[s] ?? "gray";
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function InvoiceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { data: invoice, isLoading } = useInvoice(id!);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-8 w-8 text-brand-500 animate-spin" />
      </div>
    );
  }

  if (!invoice) {
    return (
      <div className="text-center py-24 text-muted">Invoice not found.</div>
    );
  }

  const handleDownloadPdf = () => {
    window.open(`/api/v1/invoices/${invoice.id}/pdf/`, "_blank");
  };

  return (
    <div className="max-w-4xl mx-auto">
      {/* Breadcrumb */}
      <button
        onClick={() => navigate("/invoices")}
        className="flex items-center gap-1.5 text-sm text-muted hover:text-brand-700 mb-5"
      >
        <ChevronLeft className="h-4 w-4" />
        Invoices
      </button>

      {/* Header */}
      <div className="page-header">
        <div className="flex items-center gap-3">
          <h1 className="page-title font-mono">{invoice.invoice_number}</h1>
          <Badge variant={statusVariant(invoice.status)}>{invoice.status}</Badge>
        </div>
        <Button variant="secondary" onClick={handleDownloadPdf}>
          <Download className="h-4 w-4" />
          Download PDF
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* ── Invoice Preview ─────────────────────────────────────────── */}
        <div className="lg:col-span-2 space-y-5">

          {/* Invoice header card */}
          <div className="card">
            <div className="flex justify-between gap-4 flex-wrap">
              <div>
                <p className="text-xl font-bold text-text">
                  {user?.organization?.name}
                </p>
                <p className="text-sm text-muted mt-0.5">
                  KRA PIN: {user?.organization?.kra_pin}
                </p>
              </div>
              <div className="text-right">
                <p className="text-xs text-muted uppercase tracking-wide">Invoice</p>
                <p className="font-mono font-bold text-brand-700">{invoice.invoice_number}</p>
                <p className="text-xs text-muted mt-1">
                  Issued: {formatDate(invoice.invoice_date)}
                </p>
                <p className="text-xs text-muted">
                  Due: {formatDate(invoice.due_date)}
                </p>
              </div>
            </div>

            <hr className="border-border my-4" />

            <div>
              <p className="text-xs text-muted uppercase tracking-wide mb-1">Bill To</p>
              <p className="font-semibold text-text">{invoice.customer_name}</p>
              {invoice.customer_kra_pin && (
                <p className="text-sm text-muted">KRA PIN: {invoice.customer_kra_pin}</p>
              )}
            </div>
          </div>

          {/* Line Items */}
          <div className="card p-0 overflow-hidden">
            <div className="table-wrapper border-0 rounded-none">
              <table className="table">
                <thead>
                  <tr>
                    <th className="w-8">#</th>
                    <th>Description</th>
                    <th className="text-right">Qty</th>
                    <th className="text-right">Unit Price</th>
                    <th className="text-right">VAT</th>
                    <th className="text-right">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {invoice.line_items.map((item, i) => (
                    <tr key={item.id ?? i}>
                      <td data-label="#" className="text-muted text-xs">{i + 1}</td>
                      <td data-label="Description">
                        <p className="font-medium">{item.description}</p>
                        {item.commodity_code && (
                          <p className="text-xs text-muted font-mono">{item.commodity_code}</p>
                        )}
                      </td>
                      <td data-label="Qty" className="text-right tabular-nums">{item.quantity}</td>
                      <td data-label="Unit Price" className="text-right tabular-nums">
                        {formatKES(item.unit_price ?? "0")}
                      </td>
                      <td data-label="VAT" className="text-right">
                        <Badge variant={item.vat_class === "standard" ? "blue" : "gray"}>
                          {item.vat_class === "standard" ? "16%" : item.vat_class === "zero_rated" ? "0%" : "Exempt"}
                        </Badge>
                      </td>
                      <td data-label="Amount" className="text-right tabular-nums font-medium">
                        {formatKES(item.line_total ?? "0")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Totals */}
            <div className="px-4 py-4 border-t border-border space-y-1.5">
              <div className="flex justify-end gap-8 text-sm">
                <span className="text-muted">Subtotal</span>
                <span className="tabular-nums font-medium w-32 text-right">
                  {formatKES(invoice.subtotal)}
                </span>
              </div>
              <div className="flex justify-end gap-8 text-sm">
                <span className="text-muted">VAT (16%)</span>
                <span className="tabular-nums font-medium text-brand-700 w-32 text-right">
                  {formatKES(invoice.vat_amount)}
                </span>
              </div>
              {parseFloat(invoice.wht_amount) > 0 && (
                <div className="flex justify-end gap-8 text-sm">
                  <span className="text-muted">WHT Deducted</span>
                  <span className="tabular-nums font-medium text-danger w-32 text-right">
                    ({formatKES(invoice.wht_amount)})
                  </span>
                </div>
              )}
              <div className="flex justify-end gap-8 border-t border-border pt-2 mt-1">
                <span className="font-bold">Total Due</span>
                <span className="tabular-nums font-bold text-lg w-32 text-right">
                  {formatKES(invoice.total_amount)}
                </span>
              </div>
              {parseFloat(invoice.amount_paid) > 0 && (
                <>
                  <div className="flex justify-end gap-8 text-sm">
                    <span className="text-muted">Amount Paid</span>
                    <span className="tabular-nums font-medium text-compliant w-32 text-right">
                      {formatKES(invoice.amount_paid)}
                    </span>
                  </div>
                  <div className="flex justify-end gap-8 text-sm font-semibold">
                    <span>Balance Due</span>
                    <span className="tabular-nums w-32 text-right text-danger">
                      {formatKES(invoice.amount_due)}
                    </span>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Notes */}
          {(invoice.notes || invoice.terms) && (
            <div className="card space-y-3">
              {invoice.notes && (
                <div>
                  <p className="text-xs font-semibold text-muted uppercase tracking-wide">Notes</p>
                  <p className="text-sm text-text mt-1 whitespace-pre-wrap">{invoice.notes}</p>
                </div>
              )}
              {invoice.terms && (
                <div>
                  <p className="text-xs font-semibold text-muted uppercase tracking-wide">Terms</p>
                  <p className="text-sm text-text mt-1 whitespace-pre-wrap">{invoice.terms}</p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Sidebar ─────────────────────────────────────────────────── */}
        <div className="space-y-4">
          {/* eTIMS Status */}
          <Card title="KRA eTIMS Status">
            <EtimsStatusCard
              status={invoice.etims_status}
              cuSerial={invoice.etims_cu_serial_no}
              receiptNumber={invoice.etims_receipt_number}
              qrCode={invoice.etims_qr_code}
              submittedAt={invoice.etims_submitted_at}
              invoiceId={invoice.id}
            />
          </Card>

          {/* Invoice Meta */}
          <Card title="Invoice Info">
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted">Created</dt>
                <dd>{formatDate(invoice.created_at)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted">Currency</dt>
                <dd className="font-mono">{invoice.currency}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted">Status</dt>
                <dd><Badge variant={statusVariant(invoice.status)}>{invoice.status}</Badge></dd>
              </div>
            </dl>
          </Card>
        </div>
      </div>
    </div>
  );
}
