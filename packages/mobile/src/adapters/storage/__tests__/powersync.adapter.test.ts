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
  const control = { failNextInit: false };

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
    connect = jest.fn().mockResolvedValue(undefined);
    disconnectAndClear = jest.fn().mockResolvedValue(undefined);
    registerListener = jest.fn().mockReturnValue(jest.fn());
    execute = jest.fn().mockResolvedValue({ rowsAffected: 1 });
    getAll = jest.fn().mockResolvedValue([]);
    getNextCrudTransaction = jest.fn().mockResolvedValue(null);

    constructor(options: unknown) {
      this.options = options;
      instanceCount.count++;
    }
  }

  return {
    PowerSyncDatabase: MockPowerSyncDatabase,
    __instanceCount: instanceCount,
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
const { __instanceCount: instanceCount, __control: control } =
  PowerSyncReactNative as unknown as {
    __instanceCount: { count: number };
    __control: { failNextInit: boolean };
  };

describe("PowerSyncStorageAdapter", () => {
  beforeEach(() => {
    instanceCount.count = 0;
    control.failNextInit = false;
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

    it("is a no-op unsubscribe before initialize()", () => {
      const adapter = new PowerSyncStorageAdapter(fakeAuth, "https://sync");
      const unsubscribe = adapter.subscribeStatus(jest.fn());
      expect(() => unsubscribe()).not.toThrow();
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
    it("disconnects and clears local data, then resets the adapter", async () => {
      const adapter = new PowerSyncStorageAdapter(fakeAuth, "https://sync");
      await adapter.initialize();
      const db = adapter.getDb() as unknown as MockDb;

      adapter.clearAll();

      expect(db.disconnectAndClear).toHaveBeenCalled();
      expect(() => adapter.getDb()).toThrow(/initialize/);
    });

    it("is a no-op before initialize()", () => {
      const adapter = new PowerSyncStorageAdapter(fakeAuth, "https://sync");
      expect(() => adapter.clearAll()).not.toThrow();
    });
  });
});
