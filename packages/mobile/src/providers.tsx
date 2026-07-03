import { type ReactNode, useEffect, useMemo } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SSTApiAdapter } from "@/adapters/api";
import { SupabaseAuthAdapter } from "@/adapters/auth";
import { RNNetInfoAdapter } from "@/adapters/netInfo";
import { PowerSyncStorageAdapter } from "@/adapters/storage";
import type { Adapters } from "@/shared/types";
import { AdapterProvider } from "@/ui/hooks/useAdapters";
import { ThemeProvider } from "@/ui/theme";

const powersyncUrl = process.env.EXPO_PUBLIC_POWERSYNC_URL ?? "";

/**
 * Root provider that wires together the shell adapters:
 * 1. Auth (Supabase session management)
 * 2. API client (auth token injection)
 * 3. Storage (PowerSync local-first SQLite, synced to Supabase)
 * 4. NetInfo (RN community netinfo)
 *
 * Also mounts a Tanstack Query client at the root for future data hooks.
 */
export function AppProviders({ children }: { children: ReactNode }) {
  const adapters = useMemo<Adapters & { _auth: SupabaseAuthAdapter }>(() => {
    const auth = new SupabaseAuthAdapter();
    const api = new SSTApiAdapter();
    const storage = new PowerSyncStorageAdapter(auth, powersyncUrl);

    // Wire auth token into API client
    api.setTokenProvider(() => auth.getAccessToken());

    return {
      _auth: auth,
      api,
      auth,
      storage,
      netInfo: new RNNetInfoAdapter(),
    };
  }, []);

  const queryClient = useMemo(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 2 * 60 * 1000,
            refetchOnWindowFocus: false,
            retry: 1,
          },
          mutations: {
            retry: 0,
          },
        },
      }),
    [],
  );

  useEffect(() => {
    // Initialize offline database on mount (async to avoid blocking JS thread)
    adapters.storage.initialize().catch((err) => {
      console.error("[AppProviders] Storage init failed:", err);
    });

    // Cleanup AppState listener when provider unmounts (hot reload, strict mode)
    return () => {
      adapters._auth.destroy();
    };
  }, [adapters]);

  return (
    <AdapterProvider adapters={adapters}>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>{children}</ThemeProvider>
      </QueryClientProvider>
    </AdapterProvider>
  );
}
