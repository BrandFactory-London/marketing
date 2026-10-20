import { sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { appSettings } from "@/db/schema";
import { createTestDb, testDatabaseUrl } from "@/test/db";
import { getModelSettings, updateModelSettings } from "./settings";

describe.skipIf(!testDatabaseUrl)("model settings (local Postgres)", () => {
  const { db, close } = createTestDb();

  beforeEach(async () => {
    await db.delete(appSettings);
  });

  afterAll(async () => {
    await db.delete(appSettings);
    await close();
  });

  it("creates the row on first read with Opus 5.5 for all three roles", async () => {
    expect(await getModelSettings(db)).toEqual({
      writerModel: "claude-opus-5-5",
      criticModel: "claude-opus-5-5",
      derivativeModel: "claude-opus-5-5",
    });
  });

  it("updates one role and leaves the others", async () => {
    const settings = await updateModelSettings({ criticModel: "claude-sonnet-5-5" }, db);
    expect(settings).toEqual({ writerModel: "claude-opus-5-5", criticModel: "claude-sonnet-5-5", derivativeModel: "claude-opus-5-5" });
  });

  it("refuses a model that is not in the config file", async () => {
    await expect(updateModelSettings({ writerModel: "gpt-5" }, db)).rejects.toThrow("Unknown model ID");
  });

  it("allows only one settings row", async () => {
    await getModelSettings(db);
    await expect(db.execute(sql`insert into app_settings (id) values (2)`)).rejects.toThrow();
  });
});
