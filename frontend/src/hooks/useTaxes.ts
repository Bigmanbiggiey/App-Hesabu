import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import type {
  TaxPeriod,
  VATReturn,
  Employee,
  PAYEReturn,
  PayrollBreakdown,
  PaginatedResponse,
  PeriodType,
} from "@/lib/types";

// ── Tax Periods ───────────────────────────────────────────────────────────────

export function useTaxPeriods(params?: Record<string, string>) {
  return useQuery({
    queryKey: ["tax-periods", params],
    queryFn: () =>
      api
        .get<PaginatedResponse<TaxPeriod>>("/taxes/periods/", { params })
        .then((r) => r.data),
  });
}

export function useCreateTaxPeriod() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { period_type: PeriodType; year: number; month: number }) =>
      api.post<TaxPeriod>("/taxes/periods/", data).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tax-periods"] }),
  });
}

export function useLockPeriod() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      api.post<TaxPeriod>(`/taxes/periods/${id}/lock/`).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tax-periods"] }),
  });
}

export function useGenerateVATReturn() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (periodId: string) =>
      api
        .post<VATReturn>(`/taxes/periods/${periodId}/generate_vat_return/`)
        .then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tax-periods"] });
      qc.invalidateQueries({ queryKey: ["vat-returns"] });
    },
  });
}

export function useGeneratePAYEReturns() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (periodId: string) =>
      api
        .post<PAYEReturn[]>(`/taxes/periods/${periodId}/generate_paye_returns/`)
        .then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tax-periods"] });
      qc.invalidateQueries({ queryKey: ["paye-returns"] });
    },
  });
}

// ── VAT Returns ───────────────────────────────────────────────────────────────

export function useVATReturns(params?: Record<string, string>) {
  return useQuery({
    queryKey: ["vat-returns", params],
    queryFn: () =>
      api
        .get<PaginatedResponse<VATReturn>>("/taxes/vat-returns/", { params })
        .then((r) => r.data),
  });
}

export function useUpdateVATReturn() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input_vat }: { id: string; input_vat: string }) =>
      api
        .patch<VATReturn>(`/taxes/vat-returns/${id}/`, { input_vat })
        .then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["vat-returns"] }),
  });
}

// ── Employees ─────────────────────────────────────────────────────────────────

export function useEmployees(params?: Record<string, string>) {
  return useQuery({
    queryKey: ["employees", params],
    queryFn: () =>
      api
        .get<PaginatedResponse<Employee>>("/taxes/employees/", { params })
        .then((r) => r.data),
  });
}

export type EmployeeFormData = Omit<Employee, "id" | "full_name" | "created_at">;

export function useCreateEmployee() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<EmployeeFormData>) =>
      api.post<Employee>("/taxes/employees/", data).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["employees"] }),
  });
}

export function useUpdateEmployee() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string } & Partial<EmployeeFormData>) =>
      api.patch<Employee>(`/taxes/employees/${id}/`, data).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["employees"] }),
  });
}

export function useDeleteEmployee() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/taxes/employees/${id}/`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["employees"] }),
  });
}

export function useCalculatePayroll() {
  return useMutation({
    mutationFn: (gross_salary: string) =>
      api
        .post<PayrollBreakdown>("/taxes/employees/calculate_payroll/", { gross_salary })
        .then((r) => r.data),
  });
}

// ── PAYE Returns ──────────────────────────────────────────────────────────────

export function usePAYEReturns(params?: Record<string, string>) {
  return useQuery({
    queryKey: ["paye-returns", params],
    queryFn: () =>
      api
        .get<PaginatedResponse<PAYEReturn>>("/taxes/paye-returns/", { params })
        .then((r) => r.data),
    enabled: !!params?.tax_period,
  });
}
