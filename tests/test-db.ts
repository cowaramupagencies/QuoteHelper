import { newDb } from "pg-mem";
import type { QueryFn } from "@/lib/db/client";
import { __setTestQueryRunner, ensureDb } from "@/lib/db/client";

let disconnect: (() => Promise<void>) | null = null;

function registerPgFunctions(mem: ReturnType<typeof newDb>) {
  mem.public.registerFunction({
    name: "current_database",
    implementation: () => "test",
  });
  mem.public.registerFunction({
    name: "trim",
    args: ["text"],
    returns: "text",
    implementation: (value: string) => value?.trim() ?? null,
  });
  mem.public.registerFunction({
    name: "upper",
    args: ["text"],
    returns: "text",
    implementation: (value: string) => value?.toUpperCase() ?? null,
  });
  mem.public.registerFunction({
    name: "lower",
    args: ["text"],
    returns: "text",
    implementation: (value: string) => value?.toLowerCase() ?? null,
  });
  mem.public.registerFunction({
    name: "replace",
    args: ["text", "text", "text"],
    returns: "text",
    implementation: (value: string, from: string, to: string) => value?.replaceAll(from, to) ?? null,
  });
  mem.public.registerFunction({
    name: "length",
    args: ["text"],
    returns: "integer",
    implementation: (value: string) => value?.length ?? 0,
  });
}

export async function setupTestDb() {
  const mem = newDb();
  registerPgFunctions(mem);

  const pg = mem.adapters.createPg();
  const client = new pg.Client();
  await client.connect();

  const runner: QueryFn = async (text, params = []) => {
    const result = await client.query(text, params);
    return {
      rows: result.rows as Record<string, unknown>[],
      rowCount: result.rowCount ?? 0,
    };
  };

  __setTestQueryRunner(runner);
  await ensureDb();

  disconnect = async () => {
    await client.end();
  };
}

export async function teardownTestDb() {
  if (disconnect) {
    await disconnect();
    disconnect = null;
  }
  __setTestQueryRunner(null);
}
