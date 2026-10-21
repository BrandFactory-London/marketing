import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb, testDatabaseUrl } from "@/test/db";
import { googleTokens, users } from "@/db/schema";
import { describeScope, getGoogleConnection } from "./connections";

describe("scope names", () => {
  it("names the scopes sign-in asks for", () => {
    expect(describeScope("https://www.googleapis.com/auth/drive.readonly")).toBe("Google Drive, read only");
    expect(describeScope("something-else")).toBe("something-else");
  });
});

describe.skipIf(!testDatabaseUrl)("Google connection (local Postgres)", () => {
  const { db, close } = createTestDb();
  const userId = randomUUID();
  afterAll(async () => {
    await db.delete(users).where(eq(users.id, userId));
    await close();
  });

  it("is null without stored tokens, then shows the account, scopes and last refresh", async () => {
    await db.insert(users).values({ id: userId, email: `connections-${userId}@example.com` });
    expect(await getGoogleConnection(userId, db)).toBeNull();
    await db.insert(googleTokens).values({ userId, refreshTokenEnc: "v1.x", scope: "openid email https://www.googleapis.com/auth/drive.readonly" });
    const connection = await getGoogleConnection(userId, db);
    expect(connection).toMatchObject({ email: `connections-${userId}@example.com`, scopes: ["openid", "email", "https://www.googleapis.com/auth/drive.readonly"] });
    expect(connection!.lastRefresh).toBeInstanceOf(Date);
  });
});
