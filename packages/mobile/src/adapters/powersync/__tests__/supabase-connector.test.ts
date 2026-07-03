/**
 * PowerSyncSupabaseConnector tests.
 *
 * `fetchCredentials` and `uploadData` are the two methods PowerSync calls
 * to sync — these tests verify the connector reuses the existing
 * `SupabaseAuthAdapter` for tokens (no duplicate auth) and drains the
 * upload queue via `supabase-js` CRUD calls per queued op.
 */

jest.mock("@powersync/react-native", () => ({
  UpdateType: { PUT: "PUT", PATCH: "PATCH", DELETE: "DELETE" },
}));

// eslint-disable-next-line import/first
import { UpdateType } from "@powersync/react-native";
// eslint-disable-next-line import/first
import type { SupabaseAuthAdapter } from "@/adapters/auth";
// eslint-disable-next-line import/first
import { PowerSyncSupabaseConnector } from "../supabase-connector";

function makeFakeAuth(accessToken: string | null, client: unknown) {
  return {
    getAccessToken: jest.fn().mockResolvedValue(accessToken),
    getClient: jest.fn().mockReturnValue(client),
  } as unknown as SupabaseAuthAdapter;
}

function makeFakeSupabaseTable() {
  const upsert = jest.fn().mockResolvedValue({ error: null });
  const eq = jest.fn().mockResolvedValue({ error: null });
  const update = jest.fn().mockReturnValue({ eq });
  const del = jest.fn().mockReturnValue({ eq });
  return { upsert, update, delete: del, eq };
}

describe("PowerSyncSupabaseConnector", () => {
  describe("fetchCredentials", () => {
    it("returns the PowerSync endpoint + the auth adapter's access token", async () => {
      const auth = makeFakeAuth("token-123", {});
      const connector = new PowerSyncSupabaseConnector(
        auth,
        "https://example.powersync.journeyapps.com",
      );

      const credentials = await connector.fetchCredentials();

      expect(credentials).toEqual({
        endpoint: "https://example.powersync.journeyapps.com",
        token: "token-123",
      });
      expect(auth.getAccessToken).toHaveBeenCalled();
    });

    it("throws when there is no session (user not signed in)", async () => {
      const auth = makeFakeAuth(null, {});
      const connector = new PowerSyncSupabaseConnector(auth, "https://x");

      await expect(connector.fetchCredentials()).rejects.toThrow(/signed in/);
    });
  });

  describe("uploadData", () => {
    it("is a no-op when there is nothing queued", async () => {
      const auth = makeFakeAuth("t", {});
      const connector = new PowerSyncSupabaseConnector(auth, "https://x");
      const database = {
        getNextCrudTransaction: jest.fn().mockResolvedValue(null),
      };

      await connector.uploadData(database as never);

      expect(database.getNextCrudTransaction).toHaveBeenCalled();
    });

    it("sends PUT ops as an upsert", async () => {
      const table = makeFakeSupabaseTable();
      const from = jest.fn().mockReturnValue(table);
      const auth = makeFakeAuth("t", { from });
      const connector = new PowerSyncSupabaseConnector(auth, "https://x");

      const complete = jest.fn().mockResolvedValue(undefined);
      const database = {
        getNextCrudTransaction: jest.fn().mockResolvedValue({
          crud: [
            {
              op: UpdateType.PUT,
              table: "expenses",
              id: "exp-1",
              opData: { description: "Dinner" },
            },
          ],
          complete,
        }),
      };

      await connector.uploadData(database as never);

      expect(from).toHaveBeenCalledWith("expenses");
      expect(table.upsert).toHaveBeenCalledWith({
        description: "Dinner",
        id: "exp-1",
      });
      expect(complete).toHaveBeenCalled();
    });

    it("sends PATCH ops as an update().eq()", async () => {
      const table = makeFakeSupabaseTable();
      const from = jest.fn().mockReturnValue(table);
      const auth = makeFakeAuth("t", { from });
      const connector = new PowerSyncSupabaseConnector(auth, "https://x");

      const complete = jest.fn().mockResolvedValue(undefined);
      const database = {
        getNextCrudTransaction: jest.fn().mockResolvedValue({
          crud: [
            {
              op: UpdateType.PATCH,
              table: "expenses",
              id: "exp-1",
              opData: { description: "Dinner (updated)" },
            },
          ],
          complete,
        }),
      };

      await connector.uploadData(database as never);

      expect(table.update).toHaveBeenCalledWith({
        description: "Dinner (updated)",
      });
      expect(table.eq).toHaveBeenCalledWith("id", "exp-1");
      expect(complete).toHaveBeenCalled();
    });

    it("sends DELETE ops as a delete().eq()", async () => {
      const table = makeFakeSupabaseTable();
      const from = jest.fn().mockReturnValue(table);
      const auth = makeFakeAuth("t", { from });
      const connector = new PowerSyncSupabaseConnector(auth, "https://x");

      const complete = jest.fn().mockResolvedValue(undefined);
      const database = {
        getNextCrudTransaction: jest.fn().mockResolvedValue({
          crud: [{ op: UpdateType.DELETE, table: "expenses", id: "exp-1" }],
          complete,
        }),
      };

      await connector.uploadData(database as never);

      expect(table.delete).toHaveBeenCalled();
      expect(table.eq).toHaveBeenCalledWith("id", "exp-1");
      expect(complete).toHaveBeenCalled();
    });

    it("discards the transaction on a fatal (constraint violation) error", async () => {
      const table = makeFakeSupabaseTable();
      table.upsert.mockResolvedValue({ error: { code: "23505" } });
      const from = jest.fn().mockReturnValue(table);
      const auth = makeFakeAuth("t", { from });
      const connector = new PowerSyncSupabaseConnector(auth, "https://x");

      const complete = jest.fn().mockResolvedValue(undefined);
      const database = {
        getNextCrudTransaction: jest.fn().mockResolvedValue({
          crud: [
            {
              op: UpdateType.PUT,
              table: "expenses",
              id: "exp-1",
              opData: {},
            },
          ],
          complete,
        }),
      };

      await connector.uploadData(database as never);

      // Discarded, not retried — the queue is drained via `complete()`.
      expect(complete).toHaveBeenCalled();
    });

    it("rethrows (for retry) on a non-fatal error", async () => {
      const table = makeFakeSupabaseTable();
      table.upsert.mockResolvedValue({
        error: { code: "500", message: "boom" },
      });
      const from = jest.fn().mockReturnValue(table);
      const auth = makeFakeAuth("t", { from });
      const connector = new PowerSyncSupabaseConnector(auth, "https://x");

      const complete = jest.fn().mockResolvedValue(undefined);
      const database = {
        getNextCrudTransaction: jest.fn().mockResolvedValue({
          crud: [
            {
              op: UpdateType.PUT,
              table: "expenses",
              id: "exp-1",
              opData: {},
            },
          ],
          complete,
        }),
      };

      await expect(connector.uploadData(database as never)).rejects.toEqual(
        expect.objectContaining({ code: "500" }),
      );
      expect(complete).not.toHaveBeenCalled();
    });
  });
});
