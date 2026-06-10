import { useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Smartphone,
  CheckCircle,
  Clock,
  AlertTriangle,
  ArrowRightLeft,
  Plus,
} from "lucide-react";
import {
  useMpesaTransactions,
  useAssignTransaction,
  usePayments,
  useCreatePayment,
  type CreatePaymentData,
} from "@/hooks/usePayments";
import { useInvoices } from "@/hooks/useInvoices";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Textarea } from "@/components/ui/Textarea";
import { Modal } from "@/components/ui/Modal";
import { EmptyState } from "@/components/ui/EmptyState";
import { formatKES, formatDate } from "@/lib/utils";
import type { MpesaTransaction, ReconciliationStatus } from "@/lib/types";

// ── Constants ─────────────────────────────────────────────────────────────────
const RECON_FILTERS = [
  { label: "All", value: "" },
  { label: "Unallocated", value: "unallocated" },
  { label: "Matched", value: "matched" },
  { label: "Partial", value: "partial" },
  { label: "Manual", value: "manual" },
] as const;

const PAYMENT_METHODS = [
  { value: "mpesa", label: "M-Pesa" },
  { value: "bank", label: "Bank Transfer" },
  { value: "cash", label: "Cash" },
  { value: "cheque", label: "Cheque" },
  { value: "other", label: "Other" },
];

// ── Badge helpers ─────────────────────────────────────────────────────────────
function reconVariant(s: ReconciliationStatus): "green" | "yellow" | "red" | "gray" | "blue" {
  const m: Record<ReconciliationStatus, "green" | "yellow" | "red" | "gray" | "blue"> = {
    matched: "green",
    partial: "yellow",
    unallocated: "red",
    manual: "blue",
  };
  return m[s] ?? "gray";
}

function reconIcon(s: ReconciliationStatus) {
  if (s === "matched" || s === "manual") return <CheckCircle className="h-3.5 w-3.5" />;
  if (s === "partial") return <Clock className="h-3.5 w-3.5" />;
  return <AlertTriangle className="h-3.5 w-3.5" />;
}

// ── Assign Modal ──────────────────────────────────────────────────────────────
function AssignModal({
  txn,
  onClose,
}: {
  txn: MpesaTransaction;
  onClose: () => void;
}) {
  const [selectedInvoice, setSelectedInvoice] = useState("");
  const { mutateAsync: assign, isPending } = useAssignTransaction();
  const { data: invoicesData } = useInvoices({ page_size: "100" });

  const outstanding = (invoicesData?.results ?? []).filter(
    (inv) => inv.status !== "paid" && inv.status !== "cancelled" && inv.status !== "draft"
  );

  const invoiceOptions = outstanding.map((inv) => ({
    value: inv.id,
    label: `${inv.invoice_number} — ${inv.customer_name} (${formatKES(inv.amount_due)} due)`,
  }));

  const handleAssign = async () => {
    if (!selectedInvoice) return;
    await assign({ txnId: txn.id, invoiceId: selectedInvoice });
    onClose();
  };

  return (
    <div className="space-y-5">
      {/* Transaction summary */}
      <div className="rounded-lg bg-mpesa-50 border border-mpesa-200 p-4 space-y-1.5 text-sm">
        <div className="flex justify-between">
          <span className="text-muted">Receipt</span>
          <span className="font-mono font-medium">{txn.mpesa_receipt_number}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted">Amount</span>
          <span className="font-bold text-mpesa-700">{formatKES(txn.amount)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted">From</span>
          <span>{txn.payer_name || txn.msisdn}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted">Date</span>
          <span>{formatDate(txn.transaction_time)}</span>
        </div>
        {txn.bill_ref_number && (
          <div className="flex justify-between">
            <span className="text-muted">Bill Ref</span>
            <span className="font-mono">{txn.bill_ref_number}</span>
          </div>
        )}
      </div>

      {/* Invoice select */}
      <div>
        <Select
          label="Assign to Invoice"
          placeholder="Select an outstanding invoice…"
          options={invoiceOptions}
          value={selectedInvoice}
          onChange={(e) => setSelectedInvoice(e.target.value)}
        />
        {outstanding.length === 0 && (
          <p className="text-xs text-muted mt-1">No outstanding invoices found.</p>
        )}
      </div>

      <div className="flex gap-2">
        <Button
          onClick={handleAssign}
          loading={isPending}
          disabled={!selectedInvoice}
          className="flex-1"
        >
          <ArrowRightLeft className="h-4 w-4" />
          Assign Payment
        </Button>
        <Button variant="secondary" onClick={onClose}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

// ── Record Payment Schema ─────────────────────────────────────────────────────
const paymentSchema = z.object({
  invoice: z.string().uuid("Select an invoice"),
  amount: z.string().refine((v) => parseFloat(v) > 0, "Must be > 0"),
  payment_date: z.string().min(1, "Required"),
  payment_method: z.enum(["mpesa", "bank", "cash", "cheque", "other"]),
  reference: z.string().default(""),
  notes: z.string().default(""),
});
type PaymentFormData = z.infer<typeof paymentSchema>;

// ── Record Payment Modal ──────────────────────────────────────────────────────
function RecordPaymentModal({ onClose }: { onClose: () => void }) {
  const { mutateAsync: createPayment } = useCreatePayment();
  const { data: invoicesData } = useInvoices({ page_size: "100" });

  const allInvoices = invoicesData?.results ?? [];
  const invoiceOptions = allInvoices
    .filter((inv) => inv.status !== "paid" && inv.status !== "cancelled")
    .map((inv) => ({
      value: inv.id,
      label: `${inv.invoice_number} — ${inv.customer_name} (${formatKES(inv.amount_due)} due)`,
    }));

  const {
    register,
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<PaymentFormData>({
    resolver: zodResolver(paymentSchema),
    defaultValues: {
      invoice: "",
      amount: "",
      payment_date: new Date().toISOString().split("T")[0],
      payment_method: "bank",
      reference: "",
      notes: "",
    },
  });

  const onSubmit = async (data: PaymentFormData) => {
    await createPayment(data as CreatePaymentData);
    onClose();
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <Controller
        name="invoice"
        control={control}
        render={({ field }) => (
          <Select
            label="Invoice"
            placeholder="Select an invoice…"
            options={invoiceOptions}
            error={errors.invoice?.message}
            {...field}
          />
        )}
      />
      <div className="grid grid-cols-2 gap-3">
        <Input
          label="Amount (KES)"
          type="number"
          step="0.01"
          min="0"
          placeholder="0.00"
          error={errors.amount?.message}
          {...register("amount")}
        />
        <Input
          label="Date"
          type="date"
          error={errors.payment_date?.message}
          {...register("payment_date")}
        />
      </div>
      <Controller
        name="payment_method"
        control={control}
        render={({ field }) => (
          <Select
            label="Payment Method"
            options={PAYMENT_METHODS}
            {...field}
          />
        )}
      />
      <Input
        label="Reference"
        placeholder="EFT-123456, cheque number…"
        {...register("reference")}
      />
      <Textarea label="Notes" placeholder="Optional notes" {...register("notes")} />
      <div className="flex gap-2">
        <Button type="submit" loading={isSubmitting} className="flex-1">
          Record Payment
        </Button>
        <Button type="button" variant="secondary" onClick={onClose}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
type Tab = "mpesa" | "history";

export default function PaymentsPage() {
  const [tab, setTab] = useState<Tab>("mpesa");
  const [reconFilter, setReconFilter] = useState("");
  const [page, setPage] = useState(1);
  const [assignTxn, setAssignTxn] = useState<MpesaTransaction | null>(null);
  const [showRecord, setShowRecord] = useState(false);

  const txnParams: Record<string, string> = { page: String(page) };
  if (reconFilter) txnParams.reconciliation_status = reconFilter;

  const { data: txnData, isLoading: txnLoading } = useMpesaTransactions(txnParams);
  const { data: paymentsData, isLoading: paymentsLoading } = usePayments({
    page: String(page),
  });

  const transactions = txnData?.results ?? [];
  const payments = paymentsData?.results ?? [];

  // Summary counts from full unfiltered data
  const { data: unallocatedData } = useMpesaTransactions({
    reconciliation_status: "unallocated",
    page_size: "1",
  });

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="page-header">
        <h1 className="page-title">M-Pesa Payments</h1>
        <Button onClick={() => setShowRecord(true)}>
          <Plus className="h-4 w-4" />
          Record Payment
        </Button>
      </div>

      {/* Unallocated alert */}
      {(unallocatedData?.count ?? 0) > 0 && (
        <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-4 flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-yellow-600 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-medium text-yellow-800">
              {unallocatedData!.count} unallocated M-Pesa payment
              {unallocatedData!.count > 1 ? "s" : ""} need your attention
            </p>
            <p className="text-xs text-yellow-700 mt-0.5">
              These payments were not automatically matched to an invoice. Assign them manually.
            </p>
          </div>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              setTab("mpesa");
              setReconFilter("unallocated");
            }}
          >
            Review
          </Button>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border">
        {(
          [
            { key: "mpesa", label: "M-Pesa Transactions" },
            { key: "history", label: "Payment History" },
          ] as { key: Tab; label: string }[]
        ).map(({ key, label }) => (
          <button
            key={key}
            onClick={() => { setTab(key); setPage(1); }}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === key
                ? "border-brand-600 text-brand-700"
                : "border-transparent text-muted hover:text-text"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ── M-Pesa Tab ── */}
      {tab === "mpesa" && (
        <div className="space-y-4">
          {/* Filter pills */}
          <div className="flex gap-1.5 flex-wrap">
            {RECON_FILTERS.map((f) => (
              <button
                key={f.value}
                onClick={() => { setReconFilter(f.value); setPage(1); }}
                className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                  reconFilter === f.value
                    ? "bg-brand-600 text-white"
                    : "bg-white border border-border text-muted hover:border-brand-300 hover:text-brand-700"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          <div className="card p-0 overflow-hidden">
            {txnLoading ? (
              <div className="divide-y divide-border">
                {[...Array(5)].map((_, i) => (
                  <div key={i} className="flex gap-4 px-4 py-3.5 animate-pulse">
                    <div className="h-4 bg-gray-100 rounded w-28" />
                    <div className="h-4 bg-gray-100 rounded flex-1" />
                    <div className="h-4 bg-gray-100 rounded w-20" />
                  </div>
                ))}
              </div>
            ) : transactions.length === 0 ? (
              <EmptyState
                icon={Smartphone}
                title="No M-Pesa transactions"
                description={
                  reconFilter
                    ? `No ${reconFilter} transactions found.`
                    : "Transactions appear here once your M-Pesa paybill receives payments."
                }
              />
            ) : (
              <>
                <div className="table-wrapper border-0 rounded-none">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Receipt #</th>
                        <th>Payer</th>
                        <th className="text-right">Amount</th>
                        <th>Bill Ref</th>
                        <th>Date</th>
                        <th>Status</th>
                        <th>Invoice</th>
                        <th className="text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {transactions.map((txn) => (
                        <tr key={txn.id}>
                          <td className="font-mono text-xs font-medium text-brand-700">
                            {txn.mpesa_receipt_number}
                          </td>
                          <td>
                            <p className="font-medium text-sm">
                              {txn.payer_name || "—"}
                            </p>
                            <p className="text-xs text-muted font-mono">{txn.msisdn}</p>
                          </td>
                          <td className="text-right font-bold tabular-nums text-mpesa-700">
                            {formatKES(txn.amount)}
                          </td>
                          <td className="font-mono text-xs text-muted">
                            {txn.bill_ref_number || "—"}
                          </td>
                          <td className="text-xs text-muted">
                            {formatDate(txn.transaction_time)}
                          </td>
                          <td>
                            <Badge variant={reconVariant(txn.reconciliation_status)}>
                              <span className="flex items-center gap-1">
                                {reconIcon(txn.reconciliation_status)}
                                {txn.reconciliation_status}
                              </span>
                            </Badge>
                          </td>
                          <td className="font-mono text-xs text-brand-700">
                            {txn.invoice_number ?? "—"}
                          </td>
                          <td className="text-right">
                            {txn.reconciliation_status === "unallocated" && (
                              <Button
                                size="sm"
                                variant="secondary"
                                onClick={() => setAssignTxn(txn)}
                              >
                                <ArrowRightLeft className="h-3.5 w-3.5" />
                                Assign
                              </Button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Pagination */}
                {(txnData?.count ?? 0) > 25 && (
                  <div className="flex items-center justify-between px-4 py-3 border-t border-border">
                    <p className="text-sm text-muted">
                      {txnData?.count} transactions total
                    </p>
                    <div className="flex gap-2">
                      <Button
                        variant="secondary"
                        size="sm"
                        disabled={!txnData?.previous}
                        onClick={() => setPage((p) => p - 1)}
                      >
                        Previous
                      </Button>
                      <Button
                        variant="secondary"
                        size="sm"
                        disabled={!txnData?.next}
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
      )}

      {/* ── Payment History Tab ── */}
      {tab === "history" && (
        <div className="card p-0 overflow-hidden">
          {paymentsLoading ? (
            <div className="divide-y divide-border">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="flex gap-4 px-4 py-3.5 animate-pulse">
                  <div className="h-4 bg-gray-100 rounded w-28" />
                  <div className="h-4 bg-gray-100 rounded flex-1" />
                  <div className="h-4 bg-gray-100 rounded w-20" />
                </div>
              ))}
            </div>
          ) : payments.length === 0 ? (
            <EmptyState
              icon={CheckCircle}
              title="No payments recorded"
              description="Payments appear here once M-Pesa transactions are reconciled or you record them manually."
              action={{ label: "Record Payment", onClick: () => setShowRecord(true) }}
            />
          ) : (
            <>
              <div className="table-wrapper border-0 rounded-none">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Invoice</th>
                      <th>Customer</th>
                      <th className="text-right">Amount</th>
                      <th>Method</th>
                      <th>Date</th>
                      <th>Reference</th>
                    </tr>
                  </thead>
                  <tbody>
                    {payments.map((p) => (
                      <tr key={p.id}>
                        <td className="font-mono text-xs font-medium text-brand-700">
                          {p.invoice_number}
                        </td>
                        <td className="font-medium">{p.customer_name}</td>
                        <td className="text-right font-bold tabular-nums">
                          {formatKES(p.amount)}
                        </td>
                        <td>
                          <Badge variant={p.payment_method === "mpesa" ? "green" : "gray"}>
                            {p.payment_method}
                          </Badge>
                        </td>
                        <td className="text-xs text-muted">{formatDate(p.payment_date)}</td>
                        <td className="font-mono text-xs text-muted">
                          {p.reference || "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {(paymentsData?.count ?? 0) > 25 && (
                <div className="flex items-center justify-between px-4 py-3 border-t border-border">
                  <p className="text-sm text-muted">{paymentsData?.count} payments total</p>
                  <div className="flex gap-2">
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={!paymentsData?.previous}
                      onClick={() => setPage((p) => p - 1)}
                    >
                      Previous
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={!paymentsData?.next}
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
      )}

      {/* Assign Modal */}
      <Modal
        open={!!assignTxn}
        onClose={() => setAssignTxn(null)}
        title="Assign M-Pesa Payment"
        size="md"
      >
        {assignTxn && (
          <AssignModal txn={assignTxn} onClose={() => setAssignTxn(null)} />
        )}
      </Modal>

      {/* Record Payment Modal */}
      <Modal
        open={showRecord}
        onClose={() => setShowRecord(false)}
        title="Record Payment"
        size="md"
      >
        <RecordPaymentModal onClose={() => setShowRecord(false)} />
      </Modal>
    </div>
  );
}
