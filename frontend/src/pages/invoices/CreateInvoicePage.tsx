import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useForm, useFieldArray, Controller } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, Trash2, ChevronLeft, UserPlus } from "lucide-react";
import { useCreateInvoice } from "@/hooks/useInvoices";
import { useCustomers, useCreateCustomer } from "@/hooks/useCustomers";
import { useAuth } from "@/hooks/useAuth";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Textarea } from "@/components/ui/Textarea";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { formatKES } from "@/lib/utils";
import { addDays, format } from "date-fns";

// ── Schemas ───────────────────────────────────────────────────────────────────
const lineItemSchema = z.object({
  description: z.string().min(1, "Required"),
  commodity_code: z.string().default(""),
  quantity: z.string().refine((v) => parseFloat(v) > 0, "Must be > 0"),
  unit_price: z.string().refine((v) => parseFloat(v) >= 0, "Must be ≥ 0"),
  vat_class: z.enum(["standard", "zero_rated", "exempt"]),
});

const schema = z.object({
  customer: z.string().uuid("Select a customer"),
  invoice_date: z.string().min(1, "Required"),
  due_date: z.string().min(1, "Required"),
  line_items: z.array(lineItemSchema).min(1, "Add at least one line item"),
  wht_amount: z.string().default("0"),
  notes: z.string().default(""),
  terms: z.string().default(""),
});

type FormData = z.infer<typeof schema>;

const newCustomerSchema = z.object({
  name: z.string().min(1, "Required"),
  kra_pin: z.string().optional().default(""),
  is_wht_agent: z.boolean().default(false),
  email: z.string().email().optional().or(z.literal("")).default(""),
  phone: z.string().optional().default(""),
});
type NewCustomerData = z.infer<typeof newCustomerSchema>;

const VAT_CLASSES = [
  { value: "standard", label: "Standard (16%)" },
  { value: "zero_rated", label: "Zero Rated (0%)" },
  { value: "exempt", label: "Exempt" },
];

// ── Component ─────────────────────────────────────────────────────────────────
export default function CreateInvoicePage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { mutateAsync: createInvoice } = useCreateInvoice();
  const { mutateAsync: createCustomer } = useCreateCustomer();
  const { data: customersData } = useCustomers({ page_size: "100" });
  const [showNewCustomer, setShowNewCustomer] = useState(false);
  const [serverError, setServerError] = useState("");

  const today = format(new Date(), "yyyy-MM-dd");
  const defaultDue = format(
    addDays(new Date(), user?.organization?.default_payment_terms_days ?? 30 as unknown as number),
    "yyyy-MM-dd"
  );

  const {
    register,
    control,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      customer: "",
      invoice_date: today,
      due_date: defaultDue,
      line_items: [
        { description: "", commodity_code: "", quantity: "1", unit_price: "", vat_class: "standard" },
      ],
      wht_amount: "0",
      notes: "",
      terms: "",
    },
  });

  const { fields, append, remove } = useFieldArray({ control, name: "line_items" });
  const lineItems = watch("line_items");
  const whtAmountStr = watch("wht_amount");
  const selectedCustomerId = watch("customer");

  // Determine if selected customer is a WHT agent
  const selectedCustomer = (customersData?.results ?? []).find((c) => c.id === selectedCustomerId);
  const isWhtAgent = selectedCustomer?.is_wht_agent ?? false;

  // Live totals
  const totals = useMemo(() => {
    let subtotal = 0;
    let vatTotal = 0;
    lineItems.forEach((item) => {
      const qty = parseFloat(item.quantity) || 0;
      const price = parseFloat(item.unit_price) || 0;
      const lineTotal = qty * price;
      subtotal += lineTotal;
      if (item.vat_class === "standard") vatTotal += lineTotal * 0.16;
    });
    const wht = parseFloat(whtAmountStr) || 0;
    return { subtotal, vatTotal, wht, total: subtotal + vatTotal - wht };
  }, [lineItems, whtAmountStr]);

  // Customer form
  const {
    register: regCust,
    handleSubmit: handleCust,
    reset: resetCust,
    formState: { errors: custErrors, isSubmitting: custSubmitting },
  } = useForm<NewCustomerData>({
    resolver: zodResolver(newCustomerSchema),
    defaultValues: { name: "", kra_pin: "", is_wht_agent: false, email: "", phone: "" },
  });

  const onAddCustomer = async (data: NewCustomerData) => {
    const created = await createCustomer({
      name: data.name,
      kra_pin: data.kra_pin ?? "",
      is_wht_agent: data.is_wht_agent,
      email: data.email ?? "",
      phone: data.phone ?? "",
      address: "",
      notes: "",
    });
    setValue("customer", created.id);
    resetCust();
    setShowNewCustomer(false);
  };

  const onSubmit = async (data: FormData) => {
    setServerError("");
    try {
      const invoice = await createInvoice(data);
      navigate(`/invoices/${invoice.id}`);
    } catch (err: unknown) {
      const detail =
        (err as { response?: { data?: Record<string, string[]> } })?.response?.data;
      setServerError(
        detail ? Object.values(detail).flat().join(" ") : "Failed to create invoice."
      );
    }
  };

  const customerOptions = (customersData?.results ?? []).map((c) => ({
    value: c.id,
    label: `${c.name}${c.kra_pin ? ` — ${c.kra_pin}` : ""}`,
  }));

  return (
    <div className="max-w-5xl mx-auto">
      {/* Breadcrumb */}
      <button
        onClick={() => navigate("/invoices")}
        className="flex items-center gap-1.5 text-sm text-muted hover:text-brand-700 mb-5"
      >
        <ChevronLeft className="h-4 w-4" />
        Invoices
      </button>

      <div className="page-header">
        <h1 className="page-title">New Invoice</h1>
      </div>

      <form onSubmit={handleSubmit(onSubmit)}>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* ── Main form ──────────────────────────────────────────────── */}
          <div className="lg:col-span-2 space-y-6">

            {/* Customer */}
            <div className="card space-y-4">
              <h2 className="font-semibold text-text">Bill To</h2>
              <div className="flex gap-2 items-end">
                <div className="flex-1">
                  <Controller
                    name="customer"
                    control={control}
                    render={({ field }) => (
                      <Select
                        label="Customer"
                        placeholder="Select a customer…"
                        options={customerOptions}
                        error={errors.customer?.message}
                        {...field}
                      />
                    )}
                  />
                </div>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => setShowNewCustomer(true)}
                  className="shrink-0 mb-0.5"
                >
                  <UserPlus className="h-4 w-4" />
                  New
                </Button>
              </div>
            </div>

            {/* Dates */}
            <div className="card">
              <h2 className="font-semibold text-text mb-4">Invoice Details</h2>
              <div className="grid grid-cols-2 gap-4">
                <Input
                  label="Invoice Date"
                  type="date"
                  error={errors.invoice_date?.message}
                  {...register("invoice_date")}
                />
                <Input
                  label="Due Date"
                  type="date"
                  error={errors.due_date?.message}
                  {...register("due_date")}
                />
              </div>
            </div>

            {/* Line Items */}
            <div className="card">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-semibold text-text">Line Items</h2>
                {errors.line_items?.root && (
                  <p className="text-xs text-danger">{errors.line_items.root.message}</p>
                )}
              </div>

              <div className="space-y-3">
                {/* Header row */}
                <div className="hidden sm:grid grid-cols-12 gap-2 text-xs font-medium text-muted px-1">
                  <span className="col-span-4">Description</span>
                  <span className="col-span-2">Qty</span>
                  <span className="col-span-2">Unit Price</span>
                  <span className="col-span-2">VAT</span>
                  <span className="col-span-1 text-right">Total</span>
                  <span className="col-span-1" />
                </div>

                {fields.map((field, i) => {
                  const qty = parseFloat(lineItems[i]?.quantity) || 0;
                  const price = parseFloat(lineItems[i]?.unit_price) || 0;
                  const lineTotal = qty * price;
                  return (
                    <div
                      key={field.id}
                      className="grid grid-cols-12 gap-2 items-start p-3 bg-gray-50 rounded-lg"
                    >
                      <div className="col-span-12 sm:col-span-4">
                        <input
                          className={`input ${errors.line_items?.[i]?.description ? "input-error" : ""}`}
                          placeholder="Item description"
                          {...register(`line_items.${i}.description`)}
                        />
                      </div>
                      <div className="col-span-4 sm:col-span-2">
                        <input
                          className={`input ${errors.line_items?.[i]?.quantity ? "input-error" : ""}`}
                          type="number"
                          step="0.0001"
                          min="0"
                          placeholder="1"
                          {...register(`line_items.${i}.quantity`)}
                        />
                      </div>
                      <div className="col-span-4 sm:col-span-2">
                        <input
                          className={`input ${errors.line_items?.[i]?.unit_price ? "input-error" : ""}`}
                          type="number"
                          step="0.01"
                          min="0"
                          placeholder="0.00"
                          {...register(`line_items.${i}.unit_price`)}
                        />
                      </div>
                      <div className="col-span-4 sm:col-span-2">
                        <select
                          className="input appearance-none"
                          {...register(`line_items.${i}.vat_class`)}
                        >
                          {VAT_CLASSES.map((v) => (
                            <option key={v.value} value={v.value}>{v.label}</option>
                          ))}
                        </select>
                      </div>
                      <div className="col-span-10 sm:col-span-1 flex items-center justify-end">
                        <span className="text-sm font-medium tabular-nums text-right">
                          {lineTotal > 0 ? `${lineTotal.toLocaleString("en-KE", { minimumFractionDigits: 2 })}` : "—"}
                        </span>
                      </div>
                      <div className="col-span-2 sm:col-span-1 flex items-center justify-end">
                        <button
                          type="button"
                          onClick={() => remove(i)}
                          disabled={fields.length === 1}
                          className="p-1.5 rounded-lg text-muted hover:text-danger hover:bg-red-50 disabled:opacity-30"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() =>
                  append({ description: "", commodity_code: "", quantity: "1", unit_price: "", vat_class: "standard" })
                }
                className="mt-3 text-brand-600"
              >
                <Plus className="h-4 w-4" />
                Add Line Item
              </Button>
            </div>

            {/* Notes */}
            <div className="card space-y-4">
              <h2 className="font-semibold text-text">Additional Info</h2>
              <Textarea
                label="Notes"
                placeholder="Payment instructions, project reference…"
                {...register("notes")}
              />
              <Textarea
                label="Terms & Conditions"
                placeholder="e.g. Payment due within 30 days"
                {...register("terms")}
              />
            </div>
          </div>

          {/* ── Summary sidebar ────────────────────────────────────────── */}
          <div className="space-y-4">
            <div className="card sticky top-6">
              <h2 className="font-semibold text-text mb-4">Summary</h2>

              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted">Subtotal</span>
                  <span className="font-medium tabular-nums">
                    {formatKES(totals.subtotal)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted">VAT (16%)</span>
                  <span className="font-medium tabular-nums text-brand-700">
                    {formatKES(totals.vatTotal)}
                  </span>
                </div>
                {isWhtAgent && (
                  <div>
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-muted">WHT Deducted</span>
                      <span className="text-xs text-orange-600 font-medium">WHT agent</span>
                    </div>
                    <input
                      className="input w-full tabular-nums text-sm"
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="0.00"
                      {...register("wht_amount")}
                    />
                    <p className="text-xs text-muted mt-0.5">
                      Amount deducted by customer as WHT
                    </p>
                  </div>
                )}
                <div className="border-t border-border pt-2 mt-2 flex justify-between">
                  <span className="font-semibold">Total</span>
                  <span className="font-bold text-base tabular-nums">
                    {formatKES(totals.total)}
                  </span>
                </div>
              </div>

              <div className="mt-4 p-3 bg-brand-50 rounded-lg">
                <p className="text-xs text-brand-700 font-medium">eTIMS Auto-Submission</p>
                <p className="text-xs text-brand-600 mt-0.5">
                  This invoice will be queued for automatic submission to KRA after saving.
                </p>
              </div>

              {serverError && (
                <p className="mt-3 text-xs text-danger bg-red-50 p-3 rounded-lg">
                  {serverError}
                </p>
              )}

              <div className="mt-5 space-y-2">
                <Button type="submit" loading={isSubmitting} className="w-full">
                  Save Invoice
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  className="w-full"
                  onClick={() => navigate("/invoices")}
                >
                  Cancel
                </Button>
              </div>
            </div>
          </div>
        </div>
      </form>

      {/* New Customer Modal */}
      <Modal
        open={showNewCustomer}
        onClose={() => setShowNewCustomer(false)}
        title="New Customer"
        size="sm"
      >
        <form onSubmit={handleCust(onAddCustomer)} className="space-y-4">
          <Input
            label="Name"
            placeholder="Safaricom PLC"
            error={custErrors.name?.message}
            {...regCust("name")}
          />
          <Input
            label="KRA PIN"
            placeholder="P000000000X"
            error={custErrors.kra_pin?.message}
            {...regCust("kra_pin")}
          />
          <Input
            label="Email"
            type="email"
            placeholder="accounts@company.co.ke"
            error={custErrors.email?.message}
            {...regCust("email")}
          />
          <Input
            label="Phone"
            placeholder="+254 7XX XXX XXX"
            {...regCust("phone")}
          />
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" className="rounded" {...regCust("is_wht_agent")} />
            WHT agent (deducts Withholding Tax)
          </label>
          <div className="flex gap-2 pt-1">
            <Button type="submit" loading={custSubmitting} className="flex-1">
              Add Customer
            </Button>
            <Button type="button" variant="secondary" onClick={() => setShowNewCustomer(false)}>
              Cancel
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
