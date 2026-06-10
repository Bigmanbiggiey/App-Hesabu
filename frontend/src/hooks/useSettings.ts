import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import type { Organization } from "@/contexts/AuthContext";

// ── Organisation ──────────────────────────────────────────────────────────────

export function useOrganization() {
  return useQuery({
    queryKey: ["organization"],
    queryFn: () => api.get<Organization>("/auth/organization/").then((r) => r.data),
  });
}

export function useUpdateOrganization() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<Organization>) =>
      api.patch<Organization>("/auth/organization/", data).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["organization"] });
      // Refresh the auth /me/ so sidebar picks up new org name
      qc.invalidateQueries({ queryKey: ["me"] });
    },
  });
}

// ── User profile ──────────────────────────────────────────────────────────────

export interface UpdateMeData {
  first_name?: string;
  last_name?: string;
  phone_number?: string;
  language?: string;
}

export function useUpdateMe() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: UpdateMeData) =>
      api.patch("/auth/me/", data).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["me"] }),
  });
}

// ── Team ──────────────────────────────────────────────────────────────────────

export interface TeamMember {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  full_name: string;
  role: string;
  phone_number: string;
  is_active: boolean;
  created_at: string;
}

export function useTeam() {
  return useQuery({
    queryKey: ["team"],
    queryFn: () => api.get<TeamMember[]>("/auth/team/").then((r) => r.data),
  });
}

// ── Reports ───────────────────────────────────────────────────────────────────

export interface MonthlyRevenue {
  year: number;
  month: number;
  total: string;
  vat: string;
  count: number;
}

export interface StatusBreakdown {
  status: string;
  count: number;
  total: string;
}

export interface TopCustomer {
  customer_name: string;
  total: string;
  count: number;
}

export interface EtimsBreakdown {
  etims_status: string;
  count: number;
}

export interface ReportsData {
  monthly_revenue: MonthlyRevenue[];
  status_breakdown: StatusBreakdown[];
  top_customers: TopCustomer[];
  etims_breakdown: EtimsBreakdown[];
}

export function useReports() {
  return useQuery({
    queryKey: ["reports"],
    queryFn: () => api.get<ReportsData>("/auth/reports/").then((r) => r.data),
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
}
