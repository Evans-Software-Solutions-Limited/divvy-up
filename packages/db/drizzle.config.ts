import { defineConfig } from "drizzle-kit";

/**
 * drizzle-kit reads DATABASE_URL directly (SST Resource injection only applies at
 * Lambda runtime, not to this CLI). For local schema work, point it at the local
 * Supabase Postgres:
 *
 *   supabase start
 *   export DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:54322/postgres"
 *   bun run db:generate   # emit SQL migration from schema.ts
 *   bun run db:migrate    # apply migrations
 */
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/schema.ts",
  out: "./drizzle",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "",
  },
  strict: true,
  verbose: true,
});
