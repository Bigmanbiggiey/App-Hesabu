import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Calculator,
  CheckCircle,
  Clock,
  Lock,
  RefreshCw,
  Plus,
  ChevronRight,
} from "lucide-react";
import {
  useTaxPeriods,
  useCreateTaxPeriod,
  useLockPeriod,
  useGenerateVATReturn,
  useGeneratePAYEReturns,
  useVATReturns,
  useUpdateVATReturn,
  usePAYEReturns,
} from "@/hooks/useTaxes";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Modal } from "@/components/ui/Modal";
import { EmptyState } from "@/components/ui/EmptyState";
import { formatKES } from "@/lib/utils";
import type { TaxPeriod, VATReturn, PeriodType, PeriodStatus } from "@/lib/types";

// ── Helpers ───────────────────────────────────────────────────────────────────
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function monthLabel(year: number, month: number) {
  return `${MONTHS[month - 1]} ${year}`;
}

function statusVariant(s: PeriodStatus): "green" | "yellow" | "red" | "gray" | "blue" {
  return s === "open" ? "yellow" : s === "submitted" ? "green" : "gray";
}

// ── New Period Schema ─────────────────────────────────────────────────────────
const periodSchema = z.object({
  period_type: z.enum(["vat", "paye"]),
  year: z.string().refine((v) => {
    const n = parseInt(v);
    return n >= 2020 && n <= 2030;
  }, "Enter a valid year"),
  month: z.string().refine((v) => {
    const n = parseInt(v);
    return n >= 1 && n <= 12;
  }, "Select a month"),
});
type PeriodFormData = z.infer<typeof periodSchema>;

// ── New Period Modal ──────────────────────────────────────────────────────────
function NewPeriodModal({
  defaultType,
  onClose,
}: {
  defaultType: PeriodType;
  onClose: () => void;
}) {
  const { mutateAsync: createPeriod } = useCreateTaxPeriod();
  const currentYear = new Date().getFullYear();

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<PeriodFormData>({
    resolver: zodResolver(periodSchema),
    defaultValues: {
      period_type: defaultType,
      year: String(currentYear),
      month: String(new Date().getMonth() + 1),
    },
  });

  const onSubmit = async (data: PeriodFormData) => {
    await createPeriod({
      period_type: data.period_type as PeriodType,
      year: parseInt(data.year),
      month: parseInt(data.month),
    });
    onClose();
  };

  const monthOptions = MONTHS.map((m, i) => ({ value: String(i + 1), label: m }));
  const yearOptions = Array.from({ length: 6 }, (_, i) => {
    const y = currentYear - 2 + i;
    return { value: String(y), label: String(y) };
  });

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <Select
        label="Type"
        options={[
          { value: "vat", label: "VAT Return" },
          { value: "paye", label: "PAYE Return" },
        ]}
        {...register("period_type")}
      />
      <div className="grid grid-cols-2 gap-3">
        <Select
          label="Year"
          options={yearOptions}
          error={errors.year?.message}
          {...register("year")}
        />
        <Select
          label="Month"
          options={monthOptions}
          error={errors.month?.message}
          {...register("month")}
        />
      </div>
      <div className="flex gap-2">
        <Button type="submit" loading={isSubmitting} className="flex-1">
          Create Period
        </Button>
        <Button type="button" variant="secondary" onClick={onClose}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

// ── VAT Return Detail Modal ───────────────────────────────────────────────────
function VATReturnModal({
  vatReturn,
  onClose,
}: {
  vatReturn: VATReturn;
  onClose: () => void;
}) {
  const [inputVat, setInputVat] = useState(vatReturn.input_vat);
  const { mutateAsync: updateVAT, isPending } = useUpdateVATReturn();

  const netPayable =
    parseFloat(vatReturn.output_vat) - parseFloat(inputVat || "0");

  const handleSave = async () => {
    await updateVAT({ id: vatReturn.id, input_vat: inputVat });
    onClose();
  };

  return (
    <div className="space-y-5">
      <div className="rounded-lg bg-brand-50 border border-brand-200 p-4 space-y-2 text-sm">
        <p className="text-xs font-semibold text-muted uppercase tracking-wide">
          {vatReturn.period_display}
        </p>
        <div className="flex justify-between">
          <span className="text-muted">Invoices (eTIMS accepted)</span>
          <span className="font-medium">{vatReturn.return_data?.invoice_count ?? "—"}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted">Output VAT (Sales)</span>
          <span className="font-bold text-brand-700">{formatKES(vatReturn.output_vat)}</span>
        </div>
      </div>

      <div>
        <Input
          label="Input VAT (Purchases) — KES"
          type="number"
          step="0.01"
          min="0"
          value={inputVat}
          onChange={(e) => setInputVat(e.target.value)}
          hint="VAT paid on supplier invoices you received this period"
        />
      </div>

      <div className="rounded-lg border border-border p-4">
        <div className="flex justify-between text-sm mb-1">
          <span className="text-muted">Output VAT</span>
          <span>{formatKES(vatReturn.output_vat)}</span>
        </div>
        <div className="flex justify-between text-sm mb-1">
          <span className="text-muted">Input VAT</span>
          <span>({formatKES(inputVat || "0")})</span>
        </div>
        <div className="flex justify-between font-bold border-t border-border pt-2 mt-2">
          <span>Net VAT Payable</span>
          <span className={netPayable >= 0 ? "text-danger" : "text-compliant"}>
            {formatKES(Math.abs(netPayable))}
            {netPayable < 0 && " (Refund)"}
          </span>
        </div>
      </div>

      <div className="flex gap-2">
        <Button onClick={handleSave} loading={isPending} className="flex-1">
          Save Changes
        </Button>
        <Button variant="secondary" onClick={onClose}>
          Close
        </Button>
      </div>
    </div>
  );
}

// ── PAYE Breakdown Modal ──────────────────────────────────────────────────────
function PAYEBreakdownModal({
  period,
  onClose,
}: {
  period: TaxPeriod;
  onClose: () => void;
}) {
  const { data, isLoading } = usePAYEReturns({ tax_period: period.id, page_size: "100" });
  const returns = data?.results ?? [];

  const totals = returns.reduce(
    (acc, r) => ({
      gross: acc.gross + parseFloat(r.gross_pay),
      paye: acc.paye + parseFloat(r.paye_deducted),
      nhif: acc.nhif + parseFloat(r.nhif_deduction),
      nssf: acc.nssf + parseFloat(r.nssf_deduction),
      housing_levy: acc.housing_levy + parseFloat(r.housing_levy ?? "0"),
      net: acc.net + parseFloat(r.net_pay),
    }),
    { gross: 0, paye: 0, nhif: 0, nssf: 0, housing_levy: 0, net: 0 }
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Badge variant="blue">{monthLabel(period.year, period.month)}</Badge>
        <Badge variant={statusVariant(period.status)}>{period.status}</Badge>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-10 bg-gray-100 rounded animate-pulse" />
          ))}
        </div>
      ) : returns.length === 0 ? (
        <p className="text-sm text-muted text-center py-6">
          No PAYE returns generated yet. Click "Generate PAYE" on the period.
        </p>
      ) : (
        <div className="overflow-x-auto -mx-1">
          <table className="table text-xs">
            <thead>
              <tr>
                <th>Employee</th>
                <th className="text-right">Gross</th>
                <th className="text-right">PAYE</th>
                <th className="text-right">NHIF</th>
                <th className="text-right">NSSF</th>
                <th className="text-right">Hsg Levy</th>
                <th className="text-right">Net Pay</th>
              </tr>
            </thead>
            <tbody>
              {returns.map((r) => (
                <tr key={r.id}>
                  <td className="font-medium">{r.employee_name}</td>
                  <td className="text-right tabular-nums">{formatKES(r.gross_pay)}</td>
                  <td className="text-right tabular-nums text-danger">{formatKES(r.paye_deducted)}</td>
                  <td className="text-right tabular-nums">{formatKES(r.nhif_deduction)}</td>
                  <td className="text-right tabular-nums">{formatKES(r.nssf_deduction)}</td>
                  <td className="text-right tabular-nums">{formatKES(r.housing_levy ?? "0")}</td>
                  <td className="text-right tabular-nums font-semibold text-compliant">
                    {formatKES(r.net_pay)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="border-t-2 border-border font-semibold bg-gray-50">
              <tr>
                <td>Totals</td>
                <td className="text-right tabular-nums">{formatKES(totals.gross)}</td>
                <td className="text-right tabular-nums text-danger">{formatKES(totals.paye)}</td>
                <td className="text-right tabular-nums">{formatKES(totals.nhif)}</td>
                <td className="text-right tabular-nums">{formatKES(totals.nssf)}</td>
                <td className="text-right tabular-nums">{formatKES(totals.housing_levy)}</td>
                <td className="text-right tabular-nums text-compliant">{formatKES(totals.net)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      <Button variant="secondary" onClick={onClose} className="w-full">
        Close
      </Button>
    </div>
  );
}

// ── VAT Periods Table ─────────────────────────────────────────────────────────
function VATPeriodsTab() {
  const [showNew, setShowNew] = useState(false);
  const [viewVAT, setViewVAT] = useState<VATReturn | null>(null);

  const { data: periodsData, isLoading } = useTaxPeriods({ period_type: "vat", page_size: "50" });
  const { data: vatReturnsData } = useVATReturns({ page_size: "100" });
  const { mutate: generate, isPending: generating, variables: genVar } = useGenerateVATReturn();
  const { mutate: lockPeriod, isPending: locking, variables: lockVar } = useLockPeriod();

  const periods = periodsData?.results ?? [];
  const vatMap = Object.fromEntries(
    (vatReturnsData?.results ?? []).map((v) => [v.tax_period, v])
  );

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button size="sm" onClick={() => setShowNew(true)}>
          <Plus className="h-4 w-4" />
          New VAT Period
        </Button>
      </div>

      <div className="card p-0 overflow-hidden">
        {isLoading ? (
          <div className="divide-y divide-border">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="flex gap-4 px-4 py-4 animate-pulse">
                <div className="h-4 bg-gray-100 rounded w-28" />
                <div className="h-4 bg-gray-100 rounded flex-1" />
              </div>
            ))}
          </div>
        ) : periods.length === 0 ? (
          <EmptyState
            icon={Calculator}
            title="No VAT periods"
            description="Create a period to generate your monthly VAT return from eTIMS accepted invoices."
            action={{ label: "New VAT Period", onClick: () => setShowNew(true) }}
          />
        ) : (
          <div className="table-wrapper border-0 rounded-none">
            <table className="table">
              <thead>
                <tr>
                  <th>Period</th>
                  <th>Status</th>
                  <th className="text-right">Output VAT</th>
                  <th className="text-right">Input VAT</th>
                  <th className="text-right">Net Payable</th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {periods.map((p) => {
                  const vat = vatMap[p.id];
                  const isGen = generating && genVar === p.id;
                  const isLock = locking && lockVar === p.id;
                  return (
                    <tr key={p.id}>
                      <td className="font-medium">{monthLabel(p.year, p.month)}</td>
                      <td>
                        <Badge variant={statusVariant(p.status)}>{p.status}</Badge>
                      </td>
                      <td className="text-right tabular-nums">
                        {vat ? formatKES(vat.output_vat) : "—"}
                      </td>
                      <td className="text-right tabular-nums">
                        {vat ? formatKES(vat.input_vat) : "—"}
                      </td>
                      <td className="text-right tabular-nums font-semibold">
                        {vat ? (
                          <span
                            className={
                              parseFloat(vat.net_vat_payable) >= 0
                                ? "text-danger"
                                : "text-compliant"
                            }
                          >
                            {formatKES(Math.abs(parseFloat(vat.net_vat_payable)))}
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          {p.status === "open" && (
                            <Button
                              size="sm"
                              variant="secondary"
                              loading={isGen}
                              onClick={() => generate(p.id)}
                            >
                              <RefreshCw className="h-3.5 w-3.5" />
                              {vat ? "Regenerate" : "Generate"}
                            </Button>
                          )}
                          {vat && (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => setViewVAT(vat)}
                            >
                              <ChevronRight className="h-3.5 w-3.5" />
                              View
                            </Button>
                          )}
                          {p.status === "open" && vat && (
                            <Button
                              size="sm"
                              variant="danger"
                              loading={isLock}
                              onClick={() => lockPeriod(p.id)}
                            >
                              <Lock className="h-3.5 w-3.5" />
                              Lock
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Modal open={showNew} onClose={() => setShowNew(false)} title="New VAT Period" size="sm">
        <NewPeriodModal defaultType="vat" onClose={() => setShowNew(false)} />
      </Modal>

      <Modal
        open={!!viewVAT}
        onClose={() => setViewVAT(null)}
        title="VAT Return Detail"
        size="md"
      >
        {viewVAT && (
          <VATReturnModal vatReturn={viewVAT} onClose={() => setViewVAT(null)} />
        )}
      </Modal>
    </div>
  );
}

// ── PAYE Periods Table ────────────────────────────────────────────────────────
function PAYEPeriodsTab() {
  const [showNew, setShowNew] = useState(false);
  const [viewPeriod, setViewPeriod] = useState<TaxPeriod | null>(null);

  const { data: periodsData, isLoading } = useTaxPeriods({ period_type: "paye", page_size: "50" });
  const { mutate: generate, isPending: generating, variables: genVar } = useGeneratePAYEReturns();
  const { mutate: lockPeriod, isPending: locking, variables: lockVar } = useLockPeriod();

  const periods = periodsData?.results ?? [];

  // Aggregate totals per period from PAYE returns
  const { data: allPayeData } = usePAYEReturns({ page_size: "500" });
  const payeSummary: Record<string, { count: number; totalPAYE: number }> = {};
  (allPayeData?.results ?? []).forEach((r) => {
    const prev = payeSummary[r.tax_period] ?? { count: 0, totalPAYE: 0 };
    payeSummary[r.tax_period] = {
      count: prev.count + 1,
      totalPAYE: prev.totalPAYE + parseFloat(r.paye_deducted),
    };
  });

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button size="sm" onClick={() => setShowNew(true)}>
          <Plus className="h-4 w-4" />
          New PAYE Period
        </Button>
      </div>

      <div className="card p-0 overflow-hidden">
        {isLoading ? (
          <div className="divide-y divide-border">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="flex gap-4 px-4 py-4 animate-pulse">
                <div className="h-4 bg-gray-100 rounded w-28" />
                <div className="h-4 bg-gray-100 rounded flex-1" />
              </div>
            ))}
          </div>
        ) : periods.length === 0 ? (
          <EmptyState
            icon={Calculator}
            title="No PAYE periods"
            description="Create a PAYE period to auto-calculate salaries and deductions for all employees."
            action={{ label: "New PAYE Period", onClick: () => setShowNew(true) }}
          />
        ) : (
          <div className="table-wrapper border-0 rounded-none">
            <table className="table">
              <thead>
                <tr>
                  <th>Period</th>
                  <th>Status</th>
                  <th className="text-right">Employees</th>
                  <th className="text-right">Total PAYE</th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {periods.map((p) => {
                  const summary = payeSummary[p.id];
                  const isGen = generating && genVar === p.id;
                  const isLock = locking && lockVar === p.id;
                  return (
                    <tr key={p.id}>
                      <td className="font-medium">{monthLabel(p.year, p.month)}</td>
                      <td>
                        <Badge variant={statusVariant(p.status)}>{p.status}</Badge>
                      </td>
                      <td className="text-right tabular-nums">
                        {summary ? summary.count : "—"}
                      </td>
                      <td className="text-right tabular-nums font-semibold text-danger">
                        {summary ? formatKES(summary.totalPAYE) : "—"}
                      </td>
                      <td className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          {p.status === "open" && (
                            <Button
                              size="sm"
                              variant="secondary"
                              loading={isGen}
                              onClick={() => generate(p.id)}
                            >
                              <RefreshCw className="h-3.5 w-3.5" />
                              {summary ? "Regenerate" : "Generate PAYE"}
                            </Button>
                          )}
                          {summary && (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => setViewPeriod(p)}
                            >
                              <ChevronRight className="h-3.5 w-3.5" />
                              Breakdown
                            </Button>
                          )}
                          {p.status === "open" && summary && (
                            <Button
                              size="sm"
                              variant="danger"
                              loading={isLock}
                              onClick={() => lockPeriod(p.id)}
                            >
                              <Lock className="h-3.5 w-3.5" />
                              Lock
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Modal open={showNew} onClose={() => setShowNew(false)} title="New PAYE Period" size="sm">
        <NewPeriodModal defaultType="paye" onClose={() => setShowNew(false)} />
      </Modal>

      <Modal
        open={!!viewPeriod}
        onClose={() => setViewPeriod(null)}
        title={`PAYE Breakdown — ${viewPeriod ? monthLabel(viewPeriod.year, viewPeriod.month) : ""}`}
        size="lg"
      >
        {viewPeriod && (
          <PAYEBreakdownModal period={viewPeriod} onClose={() => setViewPeriod(null)} />
        )}
      </Modal>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
type Tab = "vat" | "paye";

export default function TaxReturnsPage() {
  const [tab, setTab] = useState<Tab>("vat");

  return (
    <div className="space-y-5">
      <div className="page-header">
        <h1 className="page-title">Tax Returns</h1>
      </div>

      {/* Info banner */}
      <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 flex items-start gap-3">
        <CheckCircle className="h-5 w-5 text-blue-600 shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-medium text-blue-800">KRA iTax Compliance</p>
          <p className="text-xs text-blue-700 mt-0.5">
            VAT returns are pre-filled from your eTIMS-accepted invoices. Generate, review,
            then file on iTax. PAYE is computed using 2024 KRA tax bands.
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border">
        {(
          [
            { key: "vat" as Tab, label: "VAT Returns", icon: Calculator },
            { key: "paye" as Tab, label: "PAYE Returns", icon: Clock },
          ]
        ).map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === key
                ? "border-brand-600 text-brand-700"
                : "border-transparent text-muted hover:text-text"
            }`}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </div>

      {tab === "vat" && <VATPeriodsTab />}
      {tab === "paye" && <PAYEPeriodsTab />}
    </div>
  );
}
