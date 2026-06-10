// ── Domain Types ──────────────────────────────────────────────────────────────

export type InvoiceStatus = "draft" | "sent" | "partial" | "paid" | "overdue" | "cancelled";
export type EtimsStatus = "pending" | "queued" | "submitted" | "accepted" | "rejected" | "na";
export type VatClass = "standard" | "zero_rated" | "exempt";
export type ReconciliationStatus = "unallocated" | "matched" | "partial" | "manual";
export type PaymentMethod = "mpesa" | "bank" | "cash" | "cheque" | "other";

export interface Customer {
  id: string;
  name: string;
  kra_pin: string;
  is_wht_agent: boolean;
  email: string;
  phone: string;
  address: string;
  notes: string;
  created_at: string;
}

export interface LineItem {
  id?: string;
  description: string;
  commodity_code: string;
  quantity: string;
  unit_price: string;
  vat_class: VatClass;
  vat_rate?: string;
  line_total?: string;
  vat_amount?: string;
}

export interface Invoice {
  id: string;
  invoice_number: string;
  customer: string;
  customer_name: string;
  customer_kra_pin: string;
  invoice_date: string;
  due_date: string;
  status: InvoiceStatus;
  currency: string;
  subtotal: string;
  vat_amount: string;
  wht_amount: string;
  total_amount: string;
  amount_paid: string;
  amount_due: string;
  notes: string;
  terms: string;
  etims_status: EtimsStatus;
  etims_cu_serial_no: string;
  etims_receipt_number: string;
  etims_qr_code: string;
  etims_submitted_at: string | null;
  line_items: LineItem[];
  created_at: string;
}

export interface MpesaTransaction {
  id: string;
  mpesa_receipt_number: string;
  amount: string;
  msisdn: string;
  payer_name: string;
  bill_ref_number: string;
  transaction_time: string;
  reconciliation_status: ReconciliationStatus;
  invoice: string | null;
  invoice_number: string | null;
  created_at: string;
}

export interface Payment {
  id: string;
  invoice: string;
  invoice_number: string;
  customer_name: string;
  amount: string;
  payment_date: string;
  payment_method: PaymentMethod;
  reference: string;
  mpesa_transaction: string | null;
  notes: string;
  created_at: string;
}

export interface DashboardStats {
  month_invoiced: string;
  month_invoice_count: number;
  etims_pending: number;
  etims_accepted_month: number;
  etims_rejected: number;
  overdue_invoices: number;
  unallocated_mpesa: number;
}

// ── Tax Types ─────────────────────────────────────────────────────────────────

export type PeriodType = "vat" | "paye";
export type PeriodStatus = "open" | "closed" | "submitted";

export interface TaxPeriod {
  id: string;
  period_type: PeriodType;
  year: number;
  month: number;
  status: PeriodStatus;
  locked_at: string | null;
  submitted_at: string | null;
  itax_submission_ref: string;
  created_at: string;
}

export interface VATReturn {
  id: string;
  tax_period: string;
  period_display: string;
  output_vat: string;
  input_vat: string;
  net_vat_payable: string;
  return_data: { invoice_count: number } | null;
  created_at: string;
}

export interface Employee {
  id: string;
  employee_number: string;
  first_name: string;
  last_name: string;
  full_name: string;
  kra_pin: string;
  nhif_number: string;
  nssf_number: string;
  id_number: string;
  email: string;
  phone: string;
  gross_salary: string;
  basic_salary: string;
  allowances: Record<string, number>;
  is_active: boolean;
  date_of_joining: string | null;
  created_at: string;
}

export interface PAYEReturn {
  id: string;
  tax_period: string;
  employee: string;
  employee_name: string;
  gross_pay: string;
  taxable_income: string;
  paye_deducted: string;
  personal_relief: string;
  nhif_deduction: string;
  nssf_deduction: string;
  housing_levy: string;
  net_pay: string;
  created_at: string;
}

export interface PayrollBreakdown {
  gross_salary: string;
  nssf_deduction: string;
  taxable_income: string;
  paye_deducted: string;
  personal_relief: string;
  nhif_deduction: string;
  housing_levy: string;
  net_pay: string;
}

export interface PaginatedResponse<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

// ── Form Schemas ──────────────────────────────────────────────────────────────

export interface CreateInvoiceData {
  customer: string;
  invoice_date: string;
  due_date: string;
  line_items: Omit<LineItem, "id" | "vat_rate" | "line_total" | "vat_amount">[];
  notes: string;
  terms: string;
}

export interface CreateCustomerData {
  name: string;
  kra_pin: string;
  is_wht_agent: boolean;
  email: string;
  phone: string;
  address: string;
  notes: string;
}
