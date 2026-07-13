import { Elysia, t } from "elysia";
import { afterEach, describe, expect, it, vi } from "vitest";

import { coreErrorHandler } from "../errorHandler";
import { AppError } from "../AppError";

interface ErrorBody {
  code: string;
  error: string;
  detail: string;
  validation?: unknown[];
  requestId?: string;
  stack?: string;
}

function buildApp() {
  return new Elysia()
    .use(coreErrorHandler)
    .post("/validate", () => "ok", {
      body: t.Object({ name: t.String() }),
    })
    .get("/not-found", () => {
      throw new AppError("NOT_FOUND", 404, "Group abc not found");
    })
    .post("/parse", () => "ok", {
      body: t.Object({ name: t.String() }),
    })
    .get("/boom", () => {
      throw new Error("boom");
    });
}

describe("errorHandler (core)", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("maps validation errors to 422 with a validation array", async () => {
    const app = buildApp();

    const response = await app.handle(
      new Request("http://localhost/validate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      }),
    );
    const body = (await response.json()) as ErrorBody;

    expect(response.status).toBe(422);
    expect(body.code).toBe("VALIDATION");
    expect(Array.isArray(body.validation)).toBe(true);
    expect(body.validation?.length).toBeGreaterThan(0);
  });

  it("maps a thrown AppError('NOT_FOUND', 404, ...) to 404", async () => {
    const app = buildApp();

    const response = await app.handle(
      new Request("http://localhost/not-found"),
    );
    const body = (await response.json()) as ErrorBody;

    expect(response.status).toBe(404);
    expect(body.code).toBe("NOT_FOUND");
    expect(body.detail).toBe("Group abc not found");
  });

  it("maps a parse error to 400", async () => {
    const app = buildApp();

    const response = await app.handle(
      new Request("http://localhost/parse", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{not valid json",
      }),
    );
    const body = (await response.json()) as ErrorBody;

    expect(response.status).toBe(400);
    expect(body.code).toBe("PARSE");
  });

  it("maps an unknown thrown Error to 500", async () => {
    const app = buildApp();

    const response = await app.handle(new Request("http://localhost/boom"));

    expect(response.status).toBe(500);
  });

  it("includes stack and the real message on non-production stages", async () => {
    vi.stubEnv("SST_STAGE", "pr-123");
    const app = buildApp();

    const response = await app.handle(new Request("http://localhost/boom"));
    const body = (await response.json()) as ErrorBody;

    expect(body.detail).toBe("boom");
    expect(typeof body.stack).toBe("string");
  });

  it("omits stack and uses a generic detail for 5xx in production", async () => {
    vi.stubEnv("SST_STAGE", "production");
    const app = buildApp();

    const response = await app.handle(new Request("http://localhost/boom"));
    const body = (await response.json()) as ErrorBody;

    expect(body.detail).toBe("An internal error occurred.");
    expect(body.stack).toBeUndefined();
  });

  it("keeps human detail for 4xx even in production", async () => {
    vi.stubEnv("SST_STAGE", "production");
    const app = buildApp();

    const response = await app.handle(
      new Request("http://localhost/not-found"),
    );
    const body = (await response.json()) as ErrorBody;

    expect(response.status).toBe(404);
    expect(body.detail).toBe("Group abc not found");
    expect(body.stack).toBeUndefined();
  });

  it("includes requestId when x-amzn-trace-id is set", async () => {
    const app = buildApp();

    const response = await app.handle(
      new Request("http://localhost/boom", {
        headers: { "x-amzn-trace-id": "trace-abc-123" },
      }),
    );
    const body = (await response.json()) as ErrorBody;

    expect(body.requestId).toBe("trace-abc-123");
  });

  it("omits requestId when x-amzn-trace-id is not set", async () => {
    const app = buildApp();

    const response = await app.handle(new Request("http://localhost/boom"));
    const body = (await response.json()) as ErrorBody;

    expect(body.requestId).toBeUndefined();
  });
});
