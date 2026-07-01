import type { ReactNode } from "react";
import { act, renderHook, waitFor } from "@testing-library/react-native";
import { InMemoryAuthAdapter } from "@/adapters/auth/__tests__/in-memory-auth.adapter";
import type { Adapters } from "@/shared/types";
import { AdapterProvider } from "../useAdapters";
import { useAuth } from "../useAuth";

function makeStorage() {
  return {
    initialize: jest.fn().mockResolvedValue(undefined),
    clearAll: jest.fn(),
  };
}

function wrapperWith(auth: Adapters["auth"], storage: Adapters["storage"]) {
  const adapters: Adapters = {
    api: {} as Adapters["api"],
    auth,
    netInfo: {} as Adapters["netInfo"],
    storage,
  };
  function Wrapper({ children }: { children: ReactNode }) {
    return <AdapterProvider adapters={adapters}>{children}</AdapterProvider>;
  }
  return Wrapper;
}

/**
 * Regression coverage for the PowerSync re-init lifecycle gap: `clearAll()`
 * (sign-out / delete-account) tears the connection down for the rest of the
 * process, so `useAuth` must call `storage.initialize()` again whenever a
 * session reappears — otherwise a same-session sign-out → sign-in leaves
 * every local read/write throwing forever. See
 * `src/adapters/storage/__tests__/powersync.adapter.test.ts` for the
 * adapter-level half of this fix.
 */
describe("useAuth — storage re-initialization", () => {
  // Assertions below use "was called (again)" / call-count deltas rather
  // than exact totals: the bootstrap race (`getSession()` vs. the
  // `onAuthStateChange` INITIAL_SESSION replay, both guarded by the same
  // `bootstrapped` flag) can legitimately fire the effect's setup more
  // than once under the test renderer. `PowerSyncStorageAdapter.initialize()`
  // is designed to de-dupe exactly this kind of redundant call — see
  // `src/adapters/storage/__tests__/powersync.adapter.test.ts`'s
  // "de-dupes concurrent callers" test — so what matters here is that a
  // session appearing triggers *at least one* call, not exactly one.

  it("initializes storage once bootstrap resolves an existing session", async () => {
    const auth = new InMemoryAuthAdapter();
    auth.currentSession = {
      accessToken: "t",
      refreshToken: "r",
      userId: "u",
      email: "a@b.com",
      expiresAt: 0,
    };
    const storage = makeStorage();

    const { result } = renderHook(() => useAuth(), {
      wrapper: wrapperWith(auth, storage),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(storage.initialize).toHaveBeenCalled();
  });

  it("does not initialize storage when bootstrapping signed-out", async () => {
    const auth = new InMemoryAuthAdapter();
    const storage = makeStorage();

    const { result } = renderHook(() => useAuth(), {
      wrapper: wrapperWith(auth, storage),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(storage.initialize).not.toHaveBeenCalled();
  });

  it("re-initializes storage after sign-out then a fresh sign-in in the same app session", async () => {
    const auth = new InMemoryAuthAdapter();
    const storage = makeStorage();

    const { result } = renderHook(() => useAuth(), {
      wrapper: wrapperWith(auth, storage),
    });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(storage.initialize).not.toHaveBeenCalled();

    await act(async () => {
      await result.current.signIn("a@b.com", "pw");
    });
    const callsAfterFirstSignIn = storage.initialize.mock.calls.length;
    expect(callsAfterFirstSignIn).toBeGreaterThan(0);

    await act(async () => {
      await result.current.signOut();
    });
    expect(storage.clearAll).toHaveBeenCalledTimes(1);
    // No new session yet — sign-out must not itself trigger a re-init.
    expect(storage.initialize.mock.calls.length).toBe(callsAfterFirstSignIn);

    await act(async () => {
      await result.current.signIn("b@c.com", "pw");
    });
    expect(storage.initialize.mock.calls.length).toBeGreaterThan(
      callsAfterFirstSignIn,
    );
  });
});
