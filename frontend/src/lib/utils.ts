import { format } from "date-fns";

export function formatKES(amount: number | string): string {
  return `KES ${Number(amount).toLocaleString("en-KE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function formatDate(date: string | Date): string {
  return format(new Date(date), "dd MMM yyyy");
}

export function cn(...classes: (string | undefined | false | null)[]): string {
  return classes.filter(Boolean).join(" ");
}

export function getEtimsStatusBadge(status: string) {
  const map: Record<string, string> = {
    pending: "badge-yellow",
    queued: "badge-blue",
    submitted: "badge-blue",
    accepted: "badge-green",
    rejected: "badge-red",
    na: "badge-gray",
  };
  return map[status] ?? "badge-gray";
}

export function getInvoiceStatusBadge(status: string) {
  const map: Record<string, string> = {
    draft: "badge-gray",
    sent: "badge-blue",
    partial: "badge-yellow",
    paid: "badge-green",
    overdue: "badge-red",
    cancelled: "badge-gray",
  };
  return map[status] ?? "badge-gray";
}
