import "server-only";
import { asc, eq, sql } from "drizzle-orm";
import { getDb, type Database } from "@/db/client";
import { clients, projectPillars, projects, projectWix } from "@/db/schema";
import { decrypt, encrypt } from "./crypto";
import { isUuid, optionalText } from "./validation";
import { WixClient, WixError, type WixCredentials, type WixMember } from "./wix";

// A project's Wix credentials (design decision 6, γ6 orientation Q1). The API key, account ID and site ID are stored as
// one AES-GCM ciphertext whose associated data names the project, so it never decrypts for another project.

export class WixSetupError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WixSetupError";
  }
}

export type WixCredentialsField = keyof WixCredentials;

function aad(projectId: string): string {
  return `wix:${projectId}`;
}

export function parseWixCredentials(input: Record<string, unknown>): { ok: true; value: WixCredentials } | { ok: false; errors: Partial<Record<WixCredentialsField, string>> } {
  const apiKey = optionalText(input.apiKey)?.replace(/\s+/g, "") ?? null;
  const accountId = optionalText(input.accountId)?.toLowerCase() ?? null;
  const siteId = optionalText(input.siteId)?.toLowerCase() ?? null;
  const errors: Partial<Record<WixCredentialsField, string>> = {};
  if (!apiKey) errors.apiKey = "Paste the API key from Wix's API Keys Manager.";
  else if (apiKey.length < 20) errors.apiKey = "That is too short to be a Wix API key. Copy the whole key.";
  if (!accountId) errors.accountId = "Enter the account ID shown in the API Keys Manager.";
  else if (!isUuid(accountId)) errors.accountId = "An account ID looks like 1a2b3c4d-1234-5678-9abc-1234567890ab.";
  if (!siteId) errors.siteId = "Enter the site ID from the site's dashboard address.";
  else if (!isUuid(siteId)) errors.siteId = "A site ID looks like 1a2b3c4d-1234-5678-9abc-1234567890ab: the part after /dashboard/.";
  if (Object.keys(errors).length > 0 || !apiKey || !accountId || !siteId) return { ok: false, errors };
  return { ok: true, value: { apiKey, accountId, siteId } };
}

// "7f3a", the end of the key, so Amir can tell keys apart without the key ever being shown again.
export function keyHint(apiKey: string): string {
  return apiKey.slice(-4);
}

export type WixSettingsView = {
  keyHint: string;
  memberId: string | null;
  memberName: string | null;
  checkedAt: Date | null;
  checkOk: boolean | null;
  checkMessage: string | null;
};

export async function getWixSettings(projectId: string, db: Database = getDb()): Promise<WixSettingsView | null> {
  if (!isUuid(projectId)) return null;
  const [row] = await db.select().from(projectWix).where(eq(projectWix.projectId, projectId));
  if (!row) return null;
  return { keyHint: row.keyHint, memberId: row.memberId, memberName: row.memberName, checkedAt: row.checkedAt, checkOk: row.checkOk, checkMessage: row.checkMessage };
}

// Saving new credentials replaces the old ones and clears the member and the last check, since they may belong to
// another site.
export async function saveWixCredentials(projectId: string, credentials: WixCredentials, db: Database = getDb()): Promise<void> {
  if (!isUuid(projectId)) throw new WixSetupError("This project no longer exists.");
  const [project] = await db.select({ id: projects.id }).from(projects).where(eq(projects.id, projectId));
  if (!project) throw new WixSetupError("This project no longer exists.");
  const values = {
    credentialsEnc: encrypt(JSON.stringify(credentials), aad(projectId)),
    keyHint: keyHint(credentials.apiKey),
    memberId: null,
    memberName: null,
    checkedAt: null,
    checkOk: null,
    checkMessage: null,
  };
  await db
    .insert(projectWix)
    .values({ projectId, ...values })
    .onConflictDoUpdate({ target: projectWix.projectId, set: { ...values, updatedAt: sql`now()` } });
}

export async function removeWixCredentials(projectId: string, db: Database = getDb()): Promise<void> {
  if (!isUuid(projectId)) return;
  await db.delete(projectWix).where(eq(projectWix.projectId, projectId));
}

export async function loadWixCredentials(projectId: string, db: Database = getDb()): Promise<WixCredentials | null> {
  if (!isUuid(projectId)) return null;
  const [row] = await db.select({ enc: projectWix.credentialsEnc }).from(projectWix).where(eq(projectWix.projectId, projectId));
  if (!row) return null;
  return JSON.parse(decrypt(row.enc, aad(projectId))) as WixCredentials;
}

export async function wixClientFor(projectId: string, options: { db?: Database; fetchImpl?: typeof fetch } = {}): Promise<WixClient> {
  const credentials = await loadWixCredentials(projectId, options.db ?? getDb());
  if (!credentials) throw new WixSetupError("This project has no Wix credentials. Add them in the project's Settings.");
  return new WixClient(credentials, { fetchImpl: options.fetchImpl });
}

export function describeWixError(error: WixError): string {
  return error.status ? `${error.status}: ${error.message}` : error.message;
}

export type WixCheckResult = { ok: boolean; message: string };

// The connection check (γ6 orientation Q1): look up the project's pillar tags on Wix. A key that cannot read the
// blog fails; a pillar with no tag on Wix is a warning, since publishing a post with that pillar would stop.
export async function checkWixConnection(projectId: string, options: { db?: Database; fetchImpl?: typeof fetch } = {}): Promise<WixCheckResult> {
  const db = options.db ?? getDb();
  const client = await wixClientFor(projectId, { db, fetchImpl: options.fetchImpl });
  const pillars = await db.select({ slug: projectPillars.slug }).from(projectPillars).where(eq(projectPillars.projectId, projectId)).orderBy(asc(projectPillars.position));
  let result: WixCheckResult;
  try {
    const tags = await client.queryTagsBySlug(pillars.map((pillar) => pillar.slug));
    const found = new Set(tags.map((tag) => tag.slug));
    const missing = pillars.filter((pillar) => !found.has(pillar.slug)).map((pillar) => pillar.slug);
    if (pillars.length === 0) result = { ok: true, message: "Connected. The project has no pillar tags to look up yet." };
    else if (missing.length === 0) result = { ok: true, message: `Connected. ${found.size} of ${pillars.length} pillar tags found on Wix.` };
    else result = { ok: true, message: `Connected, but Wix has no tag for ${missing.join(", ")}. Posts with that pillar cannot be published until the tag exists on Wix.` };
  } catch (error) {
    if (!(error instanceof WixError)) throw error;
    result = { ok: false, message: describeWixError(error) };
  }
  await db
    .update(projectWix)
    .set({ checkedAt: sql`now()`, checkOk: result.ok, checkMessage: result.message, updatedAt: sql`now()` })
    .where(eq(projectWix.projectId, projectId));
  return result;
}

export async function listWixMembers(projectId: string, options: { db?: Database; fetchImpl?: typeof fetch } = {}): Promise<WixMember[]> {
  const client = await wixClientFor(projectId, options);
  return client.listMembers();
}

// The author every post is published as. Only a member Wix lists for the site can be chosen.
export async function chooseWixMember(projectId: string, memberId: string, options: { db?: Database; fetchImpl?: typeof fetch } = {}): Promise<WixMember> {
  const db = options.db ?? getDb();
  const members = await listWixMembers(projectId, { db, fetchImpl: options.fetchImpl });
  const member = members.find((item) => item.id === memberId);
  if (!member) throw new WixSetupError("That member is not on the site any more. Reload the list.");
  await db.update(projectWix).set({ memberId: member.id, memberName: member.nickname, updatedAt: sql`now()` }).where(eq(projectWix.projectId, projectId));
  return member;
}

export type WixConnectionRow = { projectId: string; projectName: string; clientName: string; settings: WixSettingsView | null };

// Settings > Connections: every project with its Wix state.
export async function listWixConnections(db: Database = getDb()): Promise<WixConnectionRow[]> {
  const rows = await db
    .select({ projectId: projects.id, projectName: projects.name, clientName: clients.name, wix: projectWix })
    .from(projects)
    .innerJoin(clients, eq(clients.id, projects.clientId))
    .leftJoin(projectWix, eq(projectWix.projectId, projects.id))
    .orderBy(asc(clients.name), asc(projects.name));
  return rows.map((row) => ({
    projectId: row.projectId,
    projectName: row.projectName,
    clientName: row.clientName,
    settings: row.wix
      ? { keyHint: row.wix.keyHint, memberId: row.wix.memberId, memberName: row.wix.memberName, checkedAt: row.wix.checkedAt, checkOk: row.wix.checkOk, checkMessage: row.wix.checkMessage }
      : null,
  }));
}
