/**
 * PowerSyncStorageAdapter tests.
 *
 * Native SQLite (`@journeyapps/react-native-quick-sqlite`) can't run under
 * Jest, so `@powersync/react-native`'s `PowerSyncDatabase` is faked here.
 * The fake still round-trips through the adapter's real `execute`/`getAll`
 * calls, which is the minimal "local read/write, queues for upload" proof
 * called for by this phase's brief (§5.7 / §10) — see
 * `../../powersync/__tests__/supabase-connector.test.ts` for the matching
 * "drains the queue to Supabase" half.
 *
 * The mock class is defined *inside* the `jest.mock` factory (not hoisted
 * out to a shared `class` at module scope) — babel transpiles `class` to a
 * `var` that's `undefined` until its declaration line runs, and
 * babel-plugin-jest-hoist moves the `require()` behind this mock ahead of
 * that line, so an outer-scope class reference silently resolves to
 * `undefined` inside the factory.
 */

type MockDb = {
  options: unknown;
  currentStatus: { connected: boolean; connecting: boolean };
  init: jest.Mock;
  connect: jest.Mock;
  disconnectAndClear: jest.Mock;
  registerListener: jest.Mock;
  execute: jest.Mock;
  getAll: jest.Mock;
  getNextCrudTransaction: jest.Mock;
};

jest.mock("@powersync/react-native", () => {
  // Declared *inside* the factory (not hoisted out) for the same reason
  // explained above — mutated in place so the test file's `import`
  // binding stays live, letting tests assert how many
  // `PowerSyncDatabase`s a sequence of `initialize()` calls constructed,
  // and letting one test force the next instance's `init()` to reject.
  const instanceCount = { count: 0 };
  const instances: unknown[] = [];
  const control: {
    failNextInit: boolean;
    teardownPromise: Promise<void> | null;
    connectPromise: Promise<void> | null;
  } = { failNextInit: false, teardownPromise: null, connectPromise: null };

  class MockPowerSyncDatabase {
    options: unknown;
    currentStatus = { connected: false, connecting: false };
    init = jest.fn().mockImplementation(() => {
      if (control.failNextInit) {
        control.failNextInit = false;
        return Promise.reject(new Error("network error"));
      }
      return Promise.resolve(undefined);
    });
    connect = jest
      .fn()
      .mockImplementation(() => control.connectPromise ?? Promise.resolve());
    disconnectAndClear = jest
      .fn()
      .mockImplementation(() => control.teardownPromise ?? Promise.resolve());
    // Unlike a real listener registry, the returned unsubscribe clears the
    // *same* listener object callers extract via `mock.calls[n][0]` — so
    // tests calling `unsubscribe()` and then re-reading `.statusChanged`
    // (not a value destructured beforehand) see it actually detached.
    registerListener = jest
      .fn()
      .mockImplementation((listener: { statusChanged?: unknown }) => {
        return () => {
          listener.statusChanged = undefined;
        };
      });
    execute = jest.fn().mockResolvedValue({ rowsAffected: 1 });
    getAll = jest.fn().mockResolvedValue([]);
    getNextCrudTransaction = jest.fn().mockResolvedValue(null);

    constructor(options: unknown) {
      this.options = options;
      instanceCount.count++;
      instances.push(this);
    }
  }

  return {
    PowerSyncDatabase: MockPowerSyncDatabase,
    __instanceCount: instanceCount,
    __instances: instances,
    __control: control,
  };
});

jest.mock("@/adapters/powersync", () => ({
  AppSchema: { __fake: "schema" },
  PowerSyncSupabaseConnector: jest.fn().mockImplementation(() => ({
    __fake: "connector",
  })),
}));

// eslint-disable-next-line import/first
import type { SupabaseAuthAdapter } from "@/adapters/auth";
// eslint-disable-next-line import/first
import * as PowerSyncReactNative from "@powersync/react-native";
// eslint-disable-next-line import/first
import { PowerSyncStorageAdapter } from "../powersync.adapter";

const fakeAuth = {} as unknown as SupabaseAuthAdapter;
const {
  __instanceCount: instanceCount,
  __instances: instances,
  __control: control,
} = PowerSyncReactNative as unknown as {
  __instanceCount: { count: number };
  __instances: MockDb[];
  __control: {
    failNextInit: boolean;
    teardownPromise: Promise<void> | null;
    connectPromise: Promise<void> | null;
  };
};

// Flush a handful of microtask turns — enough for the chained
// `.then()`/`.catch()` hops in `initialize()`/`clearAll()` to settle
// without resolving any manually-controlled deferred promise.
async function flushMicrotasks(turns = 4) {
  for (let i = 0; i < turns; i++) {
    await Promise.resolve();
  }
}

describe("PowerSyncStorageAdapter", () => {
  beforeEach(() => {
    instanceCount.count = 0;
    instances.length = 0;
    control.failNextInit = false;
    control.teardownPromise = null;
    control.connectPromise = null;
  });

  describe("initialize", () => {
    it("opens the local DB (per AppSchema) and connects it", async () => {
      const adapter = new PowerSyncStorageAdapter(fakeAuth, "https://sync");

      await adapter.initialize();

      const db = adapter.getDb() as unknown as MockDb;
      expect(db.options).toEqual(
        expect.objectContaining({
          schema: { __fake: "schema" },
          database: { dbFilename: "divvyup.db" },
        }),
      );
      expect(db.init).toHaveBeenCalled();
      expect(db.connect).toHaveBeenCalledWith({ __fake: "connector" });
    });

    it("is idempotent — a second call does not re-open the DB", async () => {
      const adapter = new PowerSyncStorageAdapter(fakeAuth, "https://sync");

      await adapter.initialize();
      const firstDb = adapter.getDb();
      await adapter.initialize();

      expect(adapter.getDb()).toBe(firstDb);
      expect(instanceCount.count).toBe(1);
    });

    it("de-dupes concurrent callers into a single connection attempt", async () => {
      // Regression: `AppProviders`'s boot effect and `useAuth` reacting to
      // the just-bootstrapped session both call `initialize()` around the
      // same tick. Without in-flight de-duping, both would race past the
      // (then-synchronous) `if (this.db) return` guard and construct two
      // separate `PowerSyncDatabase`s.
      const adapter = new PowerSyncStorageAdapter(fakeAuth, "https://sync");

      const [dbA, dbB] = await Promise.all([
        adapter.initialize().then(() => adapter.getDb()),
        adapter.initialize().then(() => adapter.getDb()),
      ]);

      expect(dbA).toBe(dbB);
      expect(instanceCount.count).toBe(1);
    });

    it("re-opens a fresh DB after clearAll() (sign-out then sign-in)", async () => {
      // Regression: PowerSync's connection, unlike a bare SQLite handle,
      // must be re-established after `clearAll()` — otherwise every local
      // read/write throws forever on the next sign-in in the same app
      // session (see `useAuth`'s `reinitStorage`).
      const adapter = new PowerSyncStorageAdapter(fakeAuth, "https://sync");

      await adapter.initialize();
      const firstDb = adapter.getDb();
      adapter.clearAll();
      expect(() => adapter.getDb()).toThrow(/initialize/);

      await adapter.initialize();

      expect(adapter.getDb()).not.toBe(firstDb);
      expect(instanceCount.count).toBe(2);
    });

    it("waits for a pending clearAll() teardown before opening a new DB", async () => {
      // Regression: a fast sign-out → sign-in must not open a *new*
      // `PowerSyncDatabase` against the same SQLite file while the old
      // one's `disconnectAndClear()` is still tearing it down — that risks
      // a locked-database error or the stale teardown wiping tables the
      // new instance has already synced into.
      const adapter = new PowerSyncStorageAdapter(fakeAuth, "https://sync");
      await adapter.initialize();
      expect(instanceCount.count).toBe(1);

      let resolveTeardown: () => void = () => {};
      control.teardownPromise = new Promise<void>((resolve) => {
        resolveTeardown = resolve;
      });

      adapter.clearAll();
      const reinit = adapter.initialize();

      // Teardown hasn't resolved yet — the new DB must not open early.
      await flushMicrotasks();
      expect(instanceCount.count).toBe(1);

      resolveTeardown();
      await reinit;

      expect(instanceCount.count).toBe(2);
    });

    it("discards a stale connection instead of installing it when clearAll() fires mid-open", async () => {
      // Regression: `clearAll()` firing while an `initialize()` was still
      // opening/connecting used to see `this.db === null` (nothing to
      // tear down yet), no-op, and then get clobbered when that stale
      // open finished and installed a connection for a session that was
      // supposed to be gone. A fresh `initialize()` called right behind
      // that `clearAll()` must also not race ahead and open a *second*
      // DB while the stale one is still resolving.
      const adapter = new PowerSyncStorageAdapter(fakeAuth, "https://sync");

      let resolveConnect: () => void = () => {};
      control.connectPromise = new Promise<void>((resolve) => {
        resolveConnect = resolve;
      });

      const staleInit = adapter.initialize();
      await flushMicrotasks();
      expect(instanceCount.count).toBe(1); // db #1 built, stuck mid-connect

      adapter.clearAll(); // nothing live yet — this.db was already null
      expect(() => adapter.getDb()).toThrow(/initialize/);

      const reinit = adapter.initialize();
      await flushMicrotasks();
      // The re-init must wait its turn behind the still-resolving stale
      // attempt, not open a second DB concurrently.
      expect(instanceCount.count).toBe(1);

      resolveConnect();
      await staleInit;

      // The stale connection noticed it was stale and discarded itself —
      // never installed into `this.db`, and torn down.
      const staleDb = instances[0];
      expect(staleDb.disconnectAndClear).toHaveBeenCalled();
      expect(() => adapter.getDb()).toThrow(/initialize/);

      await reinit;

      expect(instanceCount.count).toBe(2);
      expect(adapter.getDb()).toBe(instances[1]);
    });

    it("does not permanently cache a failed connection attempt", async () => {
      const adapter = new PowerSyncStorageAdapter(fakeAuth, "https://sync");
      control.failNextInit = true;

      await expect(adapter.initialize()).rejects.toThrow("network error");
      expect(() => adapter.getDb()).toThrow(/initialize/);

      await expect(adapter.initialize()).resolves.toBeUndefined();
      expect(adapter.getDb()).toBeTruthy();
      expect(instanceCount.count).toBe(2);
    });
  });

  describe("local read/write proof", () => {
    it("writes and reads a row through the underlying PowerSync DB", async () => {
      const adapter = new PowerSyncStorageAdapter(fakeAuth, "https://sync");
      await adapter.initialize();
      const db = adapter.getDb();

      await db.execute(
        "INSERT INTO groups (id, name, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
        ["grp-1", "Weekend trip", "user-1", "2026-07-01", "2026-07-01"],
      );
      await db.getAll("SELECT * FROM groups WHERE id = ?", ["grp-1"]);

      const fake = db as unknown as MockDb;
      expect(fake.execute).toHaveBeenCalledWith(
        expect.stringContaining("INSERT INTO groups"),
        ["grp-1", "Weekend trip", "user-1", "2026-07-01", "2026-07-01"],
      );
      expect(fake.getAll).toHaveBeenCalledWith(
        "SELECT * FROM groups WHERE id = ?",
        ["grp-1"],
      );

      // Any local write is queued by PowerSync for upload — draining that
      // queue is `getNextCrudTransaction()`, exercised by the connector.
      expect(fake.getNextCrudTransaction).toBeDefined();
    });
  });

  describe("getDb", () => {
    it("throws before initialize()", () => {
      const adapter = new PowerSyncStorageAdapter(fakeAuth, "https://sync");
      expect(() => adapter.getDb()).toThrow(/initialize/);
    });
  });

  describe("getStatus / subscribeStatus", () => {
    it("returns null before initialize()", () => {
      const adapter = new PowerSyncStorageAdapter(fakeAuth, "https://sync");
      expect(adapter.getStatus()).toBeNull();
    });

    it("unsubscribing before initialize() never throws", () => {
      const adapter = new PowerSyncStorageAdapter(fakeAuth, "https://sync");
      const unsubscribe = adapter.subscribeStatus(jest.fn());
      expect(() => unsubscribe()).not.toThrow();
    });

    it("delivers the eventual status to a listener that subscribed before initialize() resolved", async () => {
      // Regression: `useSyncStatus`'s effect can run before `AppProviders`'
      // own effect calls `initialize()` (children's effects fire before
      // parents' on mount) — e.g. `sync-blocked.tsx` mounted directly via a
      // deep link at cold boot. The listener must not be silently dropped.
      const adapter = new PowerSyncStorageAdapter(fakeAuth, "https://sync");
      const callback = jest.fn();

      const unsubscribe = adapter.subscribeStatus(callback);
      expect(callback).not.toHaveBeenCalled();

      await adapter.initialize();

      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({ connected: false }),
      );

      const db = adapter.getDb() as unknown as MockDb;
      const { statusChanged } = db.registerListener.mock.calls[0][0];
      callback.mockClear();
      statusChanged({ connected: true });
      expect(callback).toHaveBeenCalledWith({ connected: true });

      unsubscribe();
    });

    it("does not attach a listener that unsubscribed while still pending", async () => {
      const adapter = new PowerSyncStorageAdapter(fakeAuth, "https://sync");
      const callback = jest.fn();

      const unsubscribe = adapter.subscribeStatus(callback);
      unsubscribe();
      await adapter.initialize();

      expect(callback).not.toHaveBeenCalled();
    });

    it("re-attaches a still-subscribed listener to the fresh DB after clearAll() + re-initialize()", async () => {
      // Regression: a listener bound directly to `db1` via `registerListener`
      // would keep listening to that now-disconnected instance forever
      // after a same-session sign-out → sign-in swapped in `db2` — the
      // component never re-subscribes since its effect's dependency
      // (`adapter`) never changes identity.
      const adapter = new PowerSyncStorageAdapter(fakeAuth, "https://sync");
      await adapter.initialize();
      const callback = jest.fn();
      adapter.subscribeStatus(callback);
      callback.mockClear();

      adapter.clearAll();
      await adapter.initialize();

      const db2 = adapter.getDb() as unknown as MockDb;
      expect(db2.registerListener).toHaveBeenCalledWith(
        expect.objectContaining({ statusChanged: expect.any(Function) }),
      );
      expect(callback).toHaveBeenCalledWith(db2.currentStatus);

      callback.mockClear();
      const { statusChanged } = db2.registerListener.mock.calls[0][0];
      statusChanged({ connected: true });
      expect(callback).toHaveBeenCalledWith({ connected: true });
    });

    it("detaches a listener that unsubscribes after a clearAll() + re-initialize() cycle", async () => {
      const adapter = new PowerSyncStorageAdapter(fakeAuth, "https://sync");
      await adapter.initialize();
      const callback = jest.fn();
      const unsubscribe = adapter.subscribeStatus(callback);

      adapter.clearAll();
      await adapter.initialize();
      callback.mockClear();
      unsubscribe();

      const db2 = adapter.getDb() as unknown as MockDb;
      // Read fresh (not destructured before `unsubscribe()` ran above) —
      // the mock's returned unsubscribe clears this same object's
      // `statusChanged`, mirroring a real listener registry detaching.
      db2.registerListener.mock.calls[0][0].statusChanged?.({
        connected: true,
      });
      expect(callback).not.toHaveBeenCalled();
    });

    it("returns the DB's currentStatus after initialize()", async () => {
      const adapter = new PowerSyncStorageAdapter(fakeAuth, "https://sync");
      await adapter.initialize();

      expect(adapter.getStatus()).toEqual({
        connected: false,
        connecting: false,
      });
    });

    it("forwards status-change subscriptions to the DB", async () => {
      const adapter = new PowerSyncStorageAdapter(fakeAuth, "https://sync");
      await adapter.initialize();
      const db = adapter.getDb() as unknown as MockDb;

      const callback = jest.fn();
      adapter.subscribeStatus(callback);

      expect(db.registerListener).toHaveBeenCalledWith(
        expect.objectContaining({ statusChanged: expect.any(Function) }),
      );

      const { statusChanged } = db.registerListener.mock.calls[0][0];
      statusChanged({ connected: true });
      expect(callback).toHaveBeenCalledWith({ connected: true });
    });
  });

  describe("clearAll", () => {
    it("resets the adapter synchronously and disconnects the old DB", async () => {
      const adapter = new PowerSyncStorageAdapter(fakeAuth, "https://sync");
      await adapter.initialize();
      const db = adapter.getDb() as unknown as MockDb;

      adapter.clearAll();

      // getDb()/getStatus() must reflect the sign-out immediately — no
      // caller should be able to read a connection clearAll() just tore
      // down. The actual network teardown call is sequenced behind the
      // scenes (see "waits for a pending clearAll() teardown..."), so it
      // isn't necessarily synchronous.
      expect(() => adapter.getDb()).toThrow(/initialize/);

      await flushMicrotasks();
      expect(db.disconnectAndClear).toHaveBeenCalled();
    });

    it("is a no-op before initialize()", () => {
      const adapter = new PowerSyncStorageAdapter(fakeAuth, "https://sync");
      expect(() => adapter.clearAll()).not.toThrow();
    });
  });
});
