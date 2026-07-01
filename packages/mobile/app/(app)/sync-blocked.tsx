import { Screen, Text } from "../../src/ui/components";

/**
 * Sync-blocked review screen — placeholder shell screen. The mature app
 * listed sync-queue entries rejected by the server here; the shell keeps the
 * route registered for future use.
 */
export default function SyncBlockedScreen() {
  return (
    <Screen centered padded>
      <Text variant="h3" align="center">
        Nothing blocked
      </Text>
    </Screen>
  );
}
