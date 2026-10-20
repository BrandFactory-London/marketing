import "server-only";
import { sql } from "drizzle-orm";
import { getDb, type Database } from "@/db/client";
import { appSettings } from "@/db/schema";
import { isModelId, type ModelId } from "@/config/models";

export type ModelSettings = { writerModel: ModelId; criticModel: ModelId; derivativeModel: ModelId };

// Reads the single settings row, creating it with the column defaults on first read.
export async function getModelSettings(db: Database = getDb()): Promise<ModelSettings> {
  await db.insert(appSettings).values({ id: 1 }).onConflictDoNothing();
  const [row] = await db.select().from(appSettings);
  return {
    writerModel: assertModel(row.writerModel),
    criticModel: assertModel(row.criticModel),
    derivativeModel: assertModel(row.derivativeModel),
  };
}

export async function updateModelSettings(changes: Partial<Record<keyof ModelSettings, unknown>>, db: Database = getDb()) {
  const set: Partial<ModelSettings> = {};
  for (const [key, value] of Object.entries(changes) as [keyof ModelSettings, unknown][]) {
    if (value !== undefined) set[key] = assertModel(value);
  }
  await getModelSettings(db);
  await db.update(appSettings).set({ ...set, updatedAt: sql`now()` });
  return getModelSettings(db);
}

function assertModel(value: unknown): ModelId {
  if (!isModelId(value)) throw new Error(`Unknown model ID: ${String(value)}`);
  return value;
}
