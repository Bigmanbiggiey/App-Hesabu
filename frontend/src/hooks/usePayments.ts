import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import type {
  MpesaTransaction,
  Payment,
  PaginatedResponse,
  PaymentMethod,
} from "@/lib/types";

// ── M-Pesa Transactions ───────────────────────────────────────────────────────

export function useMpesaTransactions(params?: Record<string, string>) {
  return useQuery({
    queryKey: ["mpesa-transactions", params],
    queryFn: () =>
      api
        .get<PaginatedResponse<MpesaTransaction>>("/payments/mpesa/transactions/", { params })
        .then((r) => r.data),
  });
}

export function useAssignTransaction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ txnId, invoiceId }: { txnId: string; invoiceId: string }) =>
      api
        .post<MpesaTransaction>(`/payments/mpesa/transactions/${txnId}/assign/`, {
          invoice_id: invoiceId,
        })
        .then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["mpesa-transactions"] });
      qc.invalidateQueries({ queryKey: ["payments"] });
      qc.invalidateQueries({ queryKey: ["invoices"] });
      qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
    },
  });
}

// ── Payments ──────────────────────────────────────────────────────────────────

export function usePayments(params?: Record<string, string>) {
  return useQuery({
    queryKey: ["payments", params],
    queryFn: () =>
      api
        .get<PaginatedResponse<Payment>>("/payments/", { params })
        .then((r) => r.data),
  });
}

export interface CreatePaymentData {
  invoice: string;
  amount: string;
  payment_date: string;
  payment_method: PaymentMethod;
  reference: string;
  notes: string;
}

export function useCreatePayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreatePaymentData) =>
      api.post<Payment>("/payments/", data).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["payments"] });
      qc.invalidateQueries({ queryKey: ["invoices"] });
      qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
    },
  });
}
