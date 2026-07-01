import { Column, Screen, Text } from "../../src/ui/components";
import { Pill } from "../../src/ui/components/foundation";
import { useSyncStatus } from "../../src/ui/hooks";

function relativeTime(date: Date): string {
  const seconds = Math.round((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  return `${hours}h ago`;
}

/**
 * Sync status / blocked-writes screen — shows the live PowerSync
 * connection state so the user understands why local changes might not
 * have reached the server yet. The mature source app listed sync-queue
 * entries rejected by the server here; that per-item detail is added once
 * feature screens (§8 of the PowerSync phase brief) write real data.
 */
export default function SyncBlockedScreen() {
  const status = useSyncStatus();

  const hasError = Boolean(status.uploadError ?? status.downloadError);
  const tone = hasError
    ? "error"
    : status.connected
      ? "success"
      : status.connecting
        ? "gold"
        : "error";
  const label = status.connecting
    ? "Connecting…"
    : status.connected
      ? "Connected"
      : "Offline";

  return (
    <Screen centered padded>
      <Column gap="md" centered>
        <Pill tone={tone} filled>
          {label}
        </Pill>
        <Text variant="h3" align="center">
          {hasError ? "Sync is having trouble" : "Nothing blocked"}
        </Text>
        <Text variant="body" secondary align="center">
          {hasError
            ? (status.uploadError ?? status.downloadError ?? "")
            : status.connected
              ? status.uploading
                ? "Uploading local changes…"
                : status.lastSyncedAt
                  ? `Last synced ${relativeTime(status.lastSyncedAt)}`
                  : "Waiting for first sync…"
              : "Changes made offline will sync once you're back online."}
        </Text>
      </Column>
    </Screen>
  );
}
