import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import type { PaginatedResponse } from "@/lib/types";

export interface AppNotification {
  id: string;
  kind: "payment_received" | "etims_rejected" | "invoices_overdue" | "filing_reminder" | "test";
  title: string;
  body: string;
  url: string;
  read_at: string | null;
  created_at: string;
}

export interface NotificationPreferences {
  payment_received: boolean;
  etims_rejected: boolean;
  invoices_overdue: boolean;
  filing_reminder: boolean;
}

export const NOTIFICATIONS_KEY = ["notifications"] as const;

export function useNotifications(enabled = true) {
  return useQuery({
    queryKey: [...NOTIFICATIONS_KEY, "list"],
    queryFn: () =>
      api.get<PaginatedResponse<AppNotification>>("/notifications/").then((r) => r.data),
    enabled,
  });
}

export function useUnreadCount() {
  return useQuery({
    queryKey: [...NOTIFICATIONS_KEY, "unread-count"],
    queryFn: () =>
      api.get<{ count: number }>("/notifications/unread-count/").then((r) => r.data.count),
    // Pushes refresh this immediately (NotificationBridge); polling covers
    // devices without push.
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });
}

export function useMarkRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.post(`/notifications/${id}/read/`),
    onSuccess: () => qc.invalidateQueries({ queryKey: NOTIFICATIONS_KEY }),
  });
}

export function useMarkAllRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post("/notifications/read-all/"),
    onSuccess: () => qc.invalidateQueries({ queryKey: NOTIFICATIONS_KEY }),
  });
}

export function useNotificationPreferences() {
  return useQuery({
    queryKey: [...NOTIFICATIONS_KEY, "preferences"],
    queryFn: () =>
      api.get<NotificationPreferences>("/notifications/preferences/").then((r) => r.data),
  });
}

export function useUpdateNotificationPreferences() {
  const qc = useQueryClient();
  const key = [...NOTIFICATIONS_KEY, "preferences"];
  return useMutation({
    mutationFn: (data: Partial<NotificationPreferences>) =>
      api.patch<NotificationPreferences>("/notifications/preferences/", data).then((r) => r.data),
    // Optimistic: the switches are controlled by this query, so without it a
    // toggle snaps back until the round-trip finishes.
    onMutate: async (data) => {
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<NotificationPreferences>(key);
      if (previous) qc.setQueryData(key, { ...previous, ...data });
      return { previous };
    },
    onError: (_err, _data, context) => {
      if (context?.previous) qc.setQueryData(key, context.previous);
    },
    onSuccess: (data) => qc.setQueryData(key, data),
  });
}

export function useSendTestNotification() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post("/notifications/test/"),
    // The in-app copy exists as soon as the request returns.
    onSuccess: () => qc.invalidateQueries({ queryKey: NOTIFICATIONS_KEY }),
  });
}
