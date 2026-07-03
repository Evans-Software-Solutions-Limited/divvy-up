import { useEffect, useState } from "react";
import type { SyncStatus } from "@powersync/react-native";
import { PowerSyncStorageAdapter } from "@/adapters/storage";
import { useAdapters } from "./useAdapters";

export type SyncStatusSnapshot = {
  connected: boolean;
  connecting: boolean;
  hasSynced: boolean;
  uploading: boolean;
  downloading: boolean;
  lastSyncedAt: Date | null;
  uploadError: string | null;
  downloadError: string | null;
};

const DISCONNECTED_STATUS: SyncStatusSnapshot = {
  connected: false,
  connecting: false,
  hasSynced: false,
  uploading: false,
  downloading: false,
  lastSyncedAt: null,
  uploadError: null,
  downloadError: null,
};

function toSnapshot(status: SyncStatus): SyncStatusSnapshot {
  return {
    connected: status.connected,
    connecting: status.connecting,
    hasSynced: status.hasSynced ?? false,
    uploading: status.dataFlowStatus.uploading ?? false,
    downloading: status.dataFlowStatus.downloading ?? false,
    lastSyncedAt: status.lastSyncedAt ?? null,
    uploadError: status.dataFlowStatus.uploadError?.message ?? null,
    downloadError: status.dataFlowStatus.downloadError?.message ?? null,
  };
}

/**
 * Live PowerSync connection/sync status, for offline/blocked-sync UI (e.g.
 * `app/(app)/sync-blocked.tsx`). Falls back to a fully-disconnected
 * snapshot if the storage adapter isn't PowerSync-backed or hasn't been
 * initialized yet.
 */
export function useSyncStatus(): SyncStatusSnapshot {
  const { storage } = useAdapters();
  const adapter = storage instanceof PowerSyncStorageAdapter ? storage : null;

  const [status, setStatus] = useState<SyncStatusSnapshot>(() => {
    const current = adapter?.getStatus();
    return current ? toSnapshot(current) : DISCONNECTED_STATUS;
  });

  useEffect(() => {
    if (!adapter) return;

    const current = adapter.getStatus();
    if (current) setStatus(toSnapshot(current));

    return adapter.subscribeStatus((next) => setStatus(toSnapshot(next)));
  }, [adapter]);

  return status;
}
