import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import type { Invoice, PaginatedResponse, CreateInvoiceData } from "@/lib/types";

export function useInvoices(params?: Record<string, string>) {
  return useQuery({
    queryKey: ["invoices", params],
    queryFn: () =>
      api
        .get<PaginatedResponse<Invoice>>("/invoices/", { params })
        .then((r) => r.data),
  });
}

export function useInvoice(id: string) {
  return useQuery({
    queryKey: ["invoices", id],
    queryFn: () => api.get<Invoice>(`/invoices/${id}/`).then((r) => r.data),
    enabled: !!id,
  });
}

export function useCreateInvoice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateInvoiceData) =>
      api.post<Invoice>("/invoices/", data).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["invoices"] }),
  });
}

export function useSubmitToEtims() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      api.post<{ detail: string }>(`/invoices/${id}/submit_to_etims/`).then((r) => r.data),
    onSuccess: (_data, id) => {
      qc.invalidateQueries({ queryKey: ["invoices", id] });
      qc.invalidateQueries({ queryKey: ["invoices"] });
      qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
    },
  });
}

export function useDeleteInvoice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/invoices/${id}/`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["invoices"] }),
  });
}
