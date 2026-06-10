import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import type { DashboardStats } from "@/lib/types";

export function useDashboardStats() {
  return useQuery({
    queryKey: ["dashboard-stats"],
    queryFn: () =>
      api.get<DashboardStats>("/auth/dashboard/stats/").then((r) => r.data),
    staleTime: 1000 * 30, // refresh every 30s
  });
}
