"use client";

import * as React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/fs/ui/toast";
import { TooltipProvider } from "@/components/fs/ui/overlay";
import { ApiClientError } from "@/lib/client/api";

/**
 * Client providers.
 *
 * Note what is no longer here: `next-themes` pinned the app to `forcedTheme="dark"`,
 * which silently defeated the light theme. Theme state now lives in
 * `src/components/fs/theme.tsx` and is applied to <html> before first paint by
 * the bootstrap script in layout.tsx.
 */
export function Providers({ children }: { children: React.ReactNode }) {
  const [client] = React.useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 20_000,
            retry: (count, err) => {
              // Only retry what the API client classified as retryable. A 403,
              // a validation failure, or a non-API throw must not be retried.
              if (!(err instanceof ApiClientError) || !err.retryable) return false;
              return count < 2;
            },
            refetchOnWindowFocus: false,
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={client}>
      <TooltipProvider>
        {children}
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}