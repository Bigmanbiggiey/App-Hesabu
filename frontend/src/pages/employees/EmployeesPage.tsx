import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, Users, Pencil, Trash2, Calculator, X } from "lucide-react";
import {
  useEmployees,
  useCreateEmployee,
  useUpdateEmployee,
  useDeleteEmployee,
  useCalculatePayroll,
} from "@/hooks/useTaxes";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { EmptyState } from "@/components/ui/EmptyState";
import { formatKES } from "@/lib/utils";
import type { Employee, PayrollBreakdown } from "@/lib/types";

// ── Employee Schema ───────────────────────────────────────────────────────────
const allowanceEntrySchema = z.object({
  name: z.string().min(1, "Required"),
  amount: z.string().refine((v) => parseFloat(v) >= 0, "Must be ≥ 0"),
});

const employeeSchema = z.object({
  first_name: z.string().min(1, "Required"),
  last_name: z.string().min(1, "Required"),
  employee_number: z.string().default(""),
  kra_pin: z.string().default(""),
  nhif_number: z.string().default(""),
  nssf_number: z.string().default(""),
  id_number: z.string().default(""),
  email: z.string().email("Invalid email").optional().or(z.literal("")).default(""),
  phone: z.string().default(""),
  basic_salary: z.string().refine((v) => parseFloat(v) >= 0, "Must be ≥ 0"),
  allowance_entries: z.array(allowanceEntrySchema).default([]),
  is_active: z.boolean().default(true),
  date_of_joining: z.string().optional().default(""),
});
type EmployeeFormData = z.infer<typeof employeeSchema>;

// Compute gross from basic + allowances
function computeGross(basic: string, entries: { name: string; amount: string }[]): number {
  const b = parseFloat(basic) || 0;
  const a = entries.reduce((s, e) => s + (parseFloat(e.amount) || 0), 0);
  return b + a;
}

// Convert allowances Record to entries array
function allowancesToEntries(allowances: Record<string, number>) {
  return Object.entries(allowances).map(([name, amount]) => ({
    name,
    amount: String(amount),
  }));
}

// Convert entries array to allowances Record
function entriesToAllowances(entries: { name: string; amount: string }[]): Record<string, number> {
  const result: Record<string, number> = {};
  entries.forEach((e) => {
    if (e.name) result[e.name] = parseFloat(e.amount) || 0;
  });
  return result;
}

// ── Employee Form (shared by create + edit) ───────────────────────────────────
function EmployeeForm({
  defaultValues,
  onSubmit,
  onCancel,
  submitting,
}: {
  defaultValues: EmployeeFormData;
  onSubmit: (data: EmployeeFormData) => Promise<void>;
  onCancel: () => void;
  submitting: boolean;
}) {
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<EmployeeFormData>({
    resolver: zodResolver(employeeSchema),
    defaultValues,
  });

  const basic = watch("basic_salary");
  const allowanceEntries = watch("allowance_entries");
  const gross = computeGross(basic, allowanceEntries);

  const addAllowance = () => {
    setValue("allowance_entries", [...allowanceEntries, { name: "", amount: "0" }]);
  };

  const removeAllowance = (idx: number) => {
    setValue("allowance_entries", allowanceEntries.filter((_, i) => i !== idx));
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      {/* Identity */}
      <div className="grid grid-cols-2 gap-3">
        <Input
          label="First Name"
          placeholder="John"
          error={errors.first_name?.message}
          {...register("first_name")}
        />
        <Input
          label="Last Name"
          placeholder="Doe"
          error={errors.last_name?.message}
          {...register("last_name")}
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Input
          label="Employee No."
          placeholder="EMP-001"
          {...register("employee_number")}
        />
        <Input
          label="ID Number"
          placeholder="12345678"
          {...register("id_number")}
        />
      </div>

      {/* Tax numbers */}
      <div className="grid grid-cols-3 gap-3">
        <Input
          label="KRA PIN"
          placeholder="A000000000B"
          {...register("kra_pin")}
        />
        <Input
          label="NHIF No."
          placeholder="NHIF number"
          {...register("nhif_number")}
        />
        <Input
          label="NSSF No."
          placeholder="NSSF number"
          {...register("nssf_number")}
        />
      </div>

      {/* Contact */}
      <div className="grid grid-cols-2 gap-3">
        <Input
          label="Email"
          type="email"
          placeholder="john@company.co.ke"
          error={errors.email?.message}
          {...register("email")}
        />
        <Input
          label="Phone"
          placeholder="+254 7XX XXX XXX"
          {...register("phone")}
        />
      </div>

      {/* Payroll */}
      <div className="grid grid-cols-2 gap-3">
        <Input
          label="Basic Salary (KES)"
          type="number"
          step="0.01"
          min="0"
          error={errors.basic_salary?.message}
          {...register("basic_salary")}
        />
        <div>
          <label className="text-xs font-medium text-muted block mb-1">Gross Salary (KES)</label>
          <div className="input bg-gray-50 text-muted tabular-nums select-none">
            {gross.toLocaleString("en-KE", { minimumFractionDigits: 2 })}
          </div>
          <p className="text-xs text-muted mt-0.5">Basic + allowances</p>
        </div>
      </div>

      {/* Allowances */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-xs font-medium text-muted">Allowances</label>
          <button
            type="button"
            onClick={addAllowance}
            className="text-xs text-brand-600 hover:text-brand-800 flex items-center gap-1"
          >
            <Plus className="h-3.5 w-3.5" /> Add
          </button>
        </div>
        {allowanceEntries.length === 0 ? (
          <p className="text-xs text-muted/70 py-1">No allowances. Click Add to include housing, transport, etc.</p>
        ) : (
          <div className="space-y-2">
            {allowanceEntries.map((_, idx) => (
              <div key={idx} className="flex gap-2 items-center">
                <input
                  className="input flex-1"
                  placeholder="e.g. Housing"
                  {...register(`allowance_entries.${idx}.name`)}
                />
                <input
                  className="input w-32 tabular-nums"
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0.00"
                  {...register(`allowance_entries.${idx}.amount`)}
                />
                <button
                  type="button"
                  onClick={() => removeAllowance(idx)}
                  className="p-1 text-muted hover:text-danger"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Input
          label="Date of Joining"
          type="date"
          {...register("date_of_joining")}
        />
        <div className="flex items-end pb-2">
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" className="rounded" {...register("is_active")} />
            Active employee
          </label>
        </div>
      </div>

      <div className="flex gap-2 pt-1">
        <Button type="submit" loading={submitting} className="flex-1">
          Save Employee
        </Button>
        <Button type="button" variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

// ── Payroll Calculator Modal ──────────────────────────────────────────────────
function PayrollCalculatorModal({ onClose }: { onClose: () => void }) {
  const [gross, setGross] = useState("");
  const [result, setResult] = useState<PayrollBreakdown | null>(null);
  const { mutateAsync: calc, isPending } = useCalculatePayroll();

  const handleCalc = async () => {
    if (!gross || parseFloat(gross) <= 0) return;
    const data = await calc(gross);
    setResult(data);
  };

  const Row = ({
    label,
    value,
    highlight,
    deduct,
  }: {
    label: string;
    value: string;
    highlight?: boolean;
    deduct?: boolean;
  }) => (
    <div
      className={`flex justify-between text-sm py-1.5 ${
        highlight ? "font-bold border-t border-border mt-1 pt-2" : ""
      }`}
    >
      <span className={deduct ? "text-muted" : ""}>{label}</span>
      <span
        className={`tabular-nums font-mono ${
          highlight
            ? "text-brand-700 text-base"
            : deduct
            ? "text-danger"
            : ""
        }`}
      >
        {deduct ? `(${formatKES(value)})` : formatKES(value)}
      </span>
    </div>
  );

  return (
    <div className="space-y-5">
      <div className="flex gap-2">
        <Input
          label="Gross Salary (KES/month)"
          type="number"
          step="1"
          min="0"
          placeholder="100,000"
          value={gross}
          onChange={(e) => setGross(e.target.value)}
          className="flex-1"
        />
        <div className="flex items-end">
          <Button onClick={handleCalc} loading={isPending} disabled={!gross}>
            Calculate
          </Button>
        </div>
      </div>

      {result && (
        <div className="rounded-lg border border-border p-4 space-y-0.5">
          <Row label="Gross Salary" value={result.gross_salary} />
          <Row label="NSSF Deduction" value={result.nssf_deduction} deduct />
          <div className="border-t border-dashed border-border my-1" />
          <Row label="Taxable Income" value={result.taxable_income} />
          <Row label="Gross PAYE" value={String(
            Math.max(0, parseFloat(result.paye_deducted) + parseFloat(result.personal_relief))
          )} deduct />
          <Row label="Personal Relief" value={result.personal_relief} />
          <Row label="PAYE Deducted" value={result.paye_deducted} deduct />
          <Row label="NHIF Deduction" value={result.nhif_deduction} deduct />
          <Row label="Housing Levy (1.5%)" value={result.housing_levy} deduct />
          <Row label="Net Pay" value={result.net_pay} highlight />
        </div>
      )}

      <div className="text-xs text-muted space-y-0.5">
        <p>Rates: KRA PAYE 2024 bands · NHIF 2023 Act · NSSF Act 2013 (6% of gross)</p>
        <p>Personal relief: KES 2,400/month · Housing Levy: 1.5% of gross (AHL Act 2024)</p>
      </div>

      <Button variant="secondary" onClick={onClose} className="w-full">
        Close
      </Button>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
const BLANK: EmployeeFormData = {
  first_name: "",
  last_name: "",
  employee_number: "",
  kra_pin: "",
  nhif_number: "",
  nssf_number: "",
  id_number: "",
  email: "",
  phone: "",
  basic_salary: "",
  allowance_entries: [],
  is_active: true,
  date_of_joining: "",
};

export default function EmployeesPage() {
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<Employee | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Employee | null>(null);
  const [showCalc, setShowCalc] = useState(false);
  const [showInactive, setShowInactive] = useState(false);

  const params: Record<string, string> = showInactive ? {} : { is_active: "true" };
  const { data, isLoading } = useEmployees(params);
  const { mutateAsync: createEmployee } = useCreateEmployee();
  const { mutateAsync: updateEmployee } = useUpdateEmployee();
  const { mutateAsync: deleteEmployee, isPending: isDeleting } = useDeleteEmployee();

  const employees = data?.results ?? [];

  const handleCreate = async (data: EmployeeFormData) => {
    const allowances = entriesToAllowances(data.allowance_entries);
    const gross_salary = String(computeGross(data.basic_salary, data.allowance_entries));
    await createEmployee({
      ...data,
      gross_salary,
      allowances,
      date_of_joining: data.date_of_joining || undefined,
    });
    setShowCreate(false);
  };

  const handleEdit = async (data: EmployeeFormData) => {
    if (!editing) return;
    const allowances = entriesToAllowances(data.allowance_entries);
    const gross_salary = String(computeGross(data.basic_salary, data.allowance_entries));
    await updateEmployee({
      id: editing.id,
      ...data,
      gross_salary,
      allowances,
      date_of_joining: data.date_of_joining || undefined,
    });
    setEditing(null);
  };

  const handleDelete = async () => {
    if (!confirmDelete) return;
    await deleteEmployee(confirmDelete.id);
    setConfirmDelete(null);
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="page-header">
        <h1 className="page-title">Employees</h1>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => setShowCalc(true)}>
            <Calculator className="h-4 w-4" />
            Payroll Calculator
          </Button>
          <Button onClick={() => setShowCreate(true)}>
            <Plus className="h-4 w-4" />
            Add Employee
          </Button>
        </div>
      </div>

      {/* Filter toggle */}
      <div className="flex items-center gap-2">
        <label className="flex items-center gap-2 text-sm cursor-pointer text-muted">
          <input
            type="checkbox"
            className="rounded"
            checked={showInactive}
            onChange={(e) => setShowInactive(e.target.checked)}
          />
          Show inactive employees
        </label>
        {data?.count !== undefined && (
          <span className="text-xs text-muted ml-2">
            {data.count} employee{data.count !== 1 ? "s" : ""}
          </span>
        )}
      </div>

      {/* Table */}
      <div className="card p-0 overflow-hidden">
        {isLoading ? (
          <div className="divide-y divide-border">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="flex gap-4 px-4 py-3.5 animate-pulse">
                <div className="h-4 bg-gray-100 rounded w-32" />
                <div className="h-4 bg-gray-100 rounded flex-1" />
                <div className="h-4 bg-gray-100 rounded w-24" />
              </div>
            ))}
          </div>
        ) : employees.length === 0 ? (
          <EmptyState
            icon={Users}
            title="No employees yet"
            description="Add employees to run PAYE payroll calculations and generate monthly returns."
            action={{ label: "Add Employee", onClick: () => setShowCreate(true) }}
          />
        ) : (
          <div className="table-wrapper border-0 rounded-none">
            <table className="table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Employee No.</th>
                  <th>KRA PIN</th>
                  <th className="text-right">Gross Salary</th>
                  <th className="text-right">Net Pay (est.)</th>
                  <th>Status</th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {employees.map((emp) => {
                  const allowanceTotal = Object.values(emp.allowances).reduce((s, v) => s + v, 0);
                  return (
                    <tr key={emp.id}>
                      <td>
                        <p className="font-medium">{emp.full_name}</p>
                        {emp.email && (
                          <p className="text-xs text-muted">{emp.email}</p>
                        )}
                      </td>
                      <td className="font-mono text-xs text-muted">
                        {emp.employee_number || "—"}
                      </td>
                      <td className="font-mono text-xs text-muted">
                        {emp.kra_pin || "—"}
                      </td>
                      <td className="text-right tabular-nums font-medium">
                        {formatKES(emp.gross_salary)}
                        {allowanceTotal > 0 && (
                          <p className="text-xs text-muted font-normal">
                            Basic: {formatKES(emp.basic_salary)}
                          </p>
                        )}
                      </td>
                      <td className="text-right tabular-nums text-muted text-sm">
                        —
                      </td>
                      <td>
                        <Badge variant={emp.is_active ? "green" : "gray"}>
                          {emp.is_active ? "Active" : "Inactive"}
                        </Badge>
                      </td>
                      <td className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => setEditing(emp)}
                            className="p-1.5 rounded-lg text-muted hover:text-brand-700 hover:bg-brand-50"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={() => setConfirmDelete(emp)}
                            className="p-1.5 rounded-lg text-muted hover:text-danger hover:bg-red-50"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
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

      {/* Create Modal */}
      <Modal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        title="Add Employee"
        size="lg"
      >
        <EmployeeForm
          defaultValues={BLANK}
          onSubmit={handleCreate}
          onCancel={() => setShowCreate(false)}
          submitting={false}
        />
      </Modal>

      {/* Edit Modal */}
      <Modal
        open={!!editing}
        onClose={() => setEditing(null)}
        title="Edit Employee"
        size="lg"
      >
        {editing && (
          <EmployeeForm
            defaultValues={{
              first_name: editing.first_name,
              last_name: editing.last_name,
              employee_number: editing.employee_number,
              kra_pin: editing.kra_pin,
              nhif_number: editing.nhif_number,
              nssf_number: editing.nssf_number,
              id_number: editing.id_number,
              email: editing.email,
              phone: editing.phone,
              basic_salary: editing.basic_salary,
              allowance_entries: allowancesToEntries(editing.allowances),
              is_active: editing.is_active,
              date_of_joining: editing.date_of_joining ?? "",
            }}
            onSubmit={handleEdit}
            onCancel={() => setEditing(null)}
            submitting={false}
          />
        )}
      </Modal>

      {/* Delete Confirm Modal */}
      <Modal
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        title="Remove Employee"
        size="sm"
      >
        <div className="space-y-4">
          <p className="text-sm text-text">
            Remove <span className="font-semibold">{confirmDelete?.full_name}</span>?
            Their historical PAYE records will be preserved.
          </p>
          <div className="flex gap-2">
            <Button
              variant="danger"
              loading={isDeleting}
              onClick={handleDelete}
              className="flex-1"
            >
              Remove
            </Button>
            <Button variant="secondary" onClick={() => setConfirmDelete(null)}>
              Cancel
            </Button>
          </div>
        </div>
      </Modal>

      {/* Payroll Calculator Modal */}
      <Modal
        open={showCalc}
        onClose={() => setShowCalc(false)}
        title="Payroll Calculator"
        size="md"
      >
        <PayrollCalculatorModal onClose={() => setShowCalc(false)} />
      </Modal>
    </div>
  );
}
