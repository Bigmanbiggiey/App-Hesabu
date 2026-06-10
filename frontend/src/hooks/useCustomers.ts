import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import type { Customer, PaginatedResponse, CreateCustomerData } from "@/lib/types";

export function useCustomers(params?: Record<string, string>) {
  return useQuery({
    queryKey: ["customers", params],
    queryFn: () =>
      api
        .get<PaginatedResponse<Customer>>("/invoices/customers/", { params })
        .then((r) => r.data),
  });
}

export function useCreateCustomer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateCustomerData) =>
      api.post<Customer>("/invoices/customers/", data).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["customers"] }),
  });
}

export function useUpdateCustomer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<CreateCustomerData> }) =>
      api.patch<Customer>(`/invoices/customers/${id}/`, data).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["customers"] }),
  });
}

export function useDeleteCustomer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/invoices/customers/${id}/`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["customers"] }),
  });
}
