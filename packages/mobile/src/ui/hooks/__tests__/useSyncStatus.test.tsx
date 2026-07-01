import type { ReactNode } from "react";
import { renderHook, act } from "@testing-library/react-native";
import { AdapterProvider } from "../useAdapters";
import { useSyncStatus } from "../useSyncStatus";
import { PowerSyncStorageAdapter } from "@/adapters/storage";
import type { Adapters } from "@/shared/types";

function wrapperWith(storage: Adapters["storage"]) {
  const adapters = {
    api: {} as Adapters["api"],
    auth: {} as Adapters["auth"],
    netInfo: {} as Adapters["netInfo"],
    storage,
  };
  function Wrapper({ children }: { children: ReactNode }) {
    return <AdapterProvider adapters={adapters}>{children}</AdapterProvider>;
  }
  return Wrapper;
}

describe("useSyncStatus", () => {
  it("returns a disconnected snapshot when storage isn't PowerSync-backed", () => {
    const wrapper = wrapperWith({
      initialize: jest.fn(),
      clearAll: jest.fn(),
    });

    const { result } = renderHook(() => useSyncStatus(), { wrapper });

    expect(result.current).toEqual({
      connected: false,
      connecting: false,
      hasSynced: false,
      uploading: false,
      downloading: false,
      lastSyncedAt: null,
      uploadError: null,
      downloadError: null,
    });
  });

  it("reflects the PowerSyncStorageAdapter's current status and live updates", () => {
    const listeners: ((status: unknown) => void)[] = [];
    const adapter = {
      getStatus: jest.fn().mockReturnValue({
        connected: true,
        connecting: false,
        hasSynced: true,
        lastSyncedAt: new Date("2026-07-01T00:00:00Z"),
        dataFlowStatus: { uploading: false, downloading: false },
      }),
      subscribeStatus: jest.fn((cb: (status: unknown) => void) => {
        listeners.push(cb);
        return () => {
          const i = listeners.indexOf(cb);
          if (i >= 0) listeners.splice(i, 1);
        };
      }),
    };
    Object.setPrototypeOf(adapter, PowerSyncStorageAdapter.prototype);

    const wrapper = wrapperWith(adapter as unknown as Adapters["storage"]);
    const { result } = renderHook(() => useSyncStatus(), { wrapper });

    expect(result.current.connected).toBe(true);
    expect(result.current.hasSynced).toBe(true);

    act(() => {
      listeners[0]({
        connected: false,
        connecting: true,
        hasSynced: true,
        dataFlowStatus: { uploading: true, downloading: false },
      });
    });

    expect(result.current.connected).toBe(false);
    expect(result.current.connecting).toBe(true);
    expect(result.current.uploading).toBe(true);
  });
});
