import { QueryClient } from "@tanstack/react-query";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 2,   // 2 minutes
      retry: 1,
      refetchOnWindowFocus: false,
    },
    mutations: {
      // Default "online" pauses an offline mutation and replays it on
      // reconnect; for invoices/payments that's a surprise submission later.
      networkMode: "always",
    },
  },
});
