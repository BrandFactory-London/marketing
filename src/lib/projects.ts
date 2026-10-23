import "server-only";
import { asc, eq, inArray, sql } from "drizzle-orm";
import { getDb, type Database } from "@/db/client";
import { clients, projects, runs } from "@/db/schema";
import { isProjectStatus, isPublishingTarget, type ProjectStatus, type PublishingTarget } from "@/config/packages";
import type { RunPresetKey } from "@/config/run-presets";
import { londonToday } from "./dates";
import { isUuid, normaliseSiteUrl, optionalText, type FormInput, type Parsed } from "./validation";

export type Project = typeof projects.$inferSelect;
// Runs replace packages (Phase 2 A1): every project surface shows its current run instead.
export type CurrentRun = { name: string; preset: RunPresetKey; startsOn: string; endsOn: string };
export type ProjectWithClient = Project & { clientName: string; currentRun: CurrentRun | null };

export type ProjectInput = {
  clientId: string;
  name: string;
  siteUrl: string;
  status: ProjectStatus;
  publishingTarget: PublishingTarget;
};
export type ProjectField = keyof ProjectInput;

export function parseProjectInput(input: FormInput): Parsed<ProjectInput, ProjectField> {
  const errors: Partial<Record<ProjectField, string>> = {};
  const clientId = optionalText(input.clientId);
  const name = optionalText(input.name);
  const rawUrl = optionalText(input.siteUrl);
  const siteUrl = rawUrl ? normaliseSiteUrl(rawUrl) : null;
  if (!clientId || !isUuid(clientId)) errors.clientId = "Choose a client.";
  if (!name) errors.name = "Enter a project name.";
  else if (name.length > 200) errors.name = "Keep the name under 200 characters.";
  if (!rawUrl) errors.siteUrl = "Enter the website address.";
  else if (!siteUrl) errors.siteUrl = "Enter a website address such as https://www.example.com.";
  if (!isProjectStatus(input.status)) errors.status = "Choose Active or Paused.";
  const target = input.publishingTarget ?? "wix_blog";
  if (!isPublishingTarget(target)) errors.publishingTarget = "Choose a publishing target.";
  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return {
    ok: true,
    value: {
      clientId: clientId!,
      name: name!,
      siteUrl: siteUrl!,
      status: input.status as ProjectStatus,
      publishingTarget: target as PublishingTarget,
    },
  };
}

const withClient = {
  project: projects,
  clientName: clients.name,
};

// Each project's run running today, else its next one, else its latest.
async function withRuns(db: Database, rows: { project: Project; clientName: string }[], today: string = londonToday()): Promise<ProjectWithClient[]> {
  const ids = rows.map((row) => row.project.id);
  const all = ids.length ? await db.select().from(runs).where(inArray(runs.projectId, ids)).orderBy(asc(runs.startsOn)) : [];
  return rows.map((row) => {
    const own = all.filter((run) => run.projectId === row.project.id);
    const run = own.find((item) => item.startsOn <= today && today <= item.endsOn) ?? own.find((item) => item.startsOn > today) ?? own.at(-1) ?? null;
    return { ...row.project, clientName: row.clientName, currentRun: run ? { name: run.name, preset: run.preset, startsOn: run.startsOn, endsOn: run.endsOn } : null };
  });
}

// Ordered by client, then project, for the grouped Projects page and the Home gallery.
export async function listProjects(db: Database = getDb()): Promise<ProjectWithClient[]> {
  const rows = await db
    .select(withClient)
    .from(projects)
    .innerJoin(clients, eq(clients.id, projects.clientId))
    .orderBy(asc(sql`lower(${clients.name})`), asc(sql`lower(${projects.name})`), asc(projects.createdAt));
  return withRuns(db, rows);
}

export async function listClientProjects(clientId: string, db: Database = getDb()): Promise<ProjectWithClient[]> {
  if (!isUuid(clientId)) return [];
  const rows = await db
    .select(withClient)
    .from(projects)
    .innerJoin(clients, eq(clients.id, projects.clientId))
    .where(eq(projects.clientId, clientId))
    .orderBy(asc(sql`lower(${projects.name})`), asc(projects.createdAt));
  return withRuns(db, rows);
}

export async function getProject(id: string, db: Database = getDb()): Promise<ProjectWithClient | null> {
  if (!isUuid(id)) return null;
  const [row] = await db.select(withClient).from(projects).innerJoin(clients, eq(clients.id, projects.clientId)).where(eq(projects.id, id));
  return row ? (await withRuns(db, [row]))[0] : null;
}

export class UnknownClient extends Error {
  constructor() {
    super("That client no longer exists.");
    this.name = "UnknownClient";
  }
}

// A new project has no slots until its first run is set up (Phase 2 A1).
export async function createProject(value: ProjectInput, db: Database = getDb()): Promise<Project> {
  const [client] = await db.select({ id: clients.id }).from(clients).where(eq(clients.id, value.clientId));
  if (!client) throw new UnknownClient();
  const [row] = await db.insert(projects).values(value).returning();
  return row;
}

// Saves the Settings tab. status_changed_at moves only when the status actually changes. Slots belong to runs now
// (Phase 2 A1), so pausing a project no longer removes any; A4's generation skips paused projects.
export async function updateProjectSettings(id: string, value: ProjectInput, db: Database = getDb()): Promise<Project | null> {
  if (!isUuid(id)) return null;
  const [client] = await db.select({ id: clients.id }).from(clients).where(eq(clients.id, value.clientId));
  if (!client) throw new UnknownClient();
  return db.transaction(async (tx) => {
    const [row] = await tx
      .update(projects)
      .set({
        ...value,
        statusChangedAt: sql`case when ${projects.status} = ${value.status} then ${projects.statusChangedAt} else now() end`,
        updatedAt: sql`now()`,
      })
      .where(eq(projects.id, id))
      .returning();
    return row ?? null;
  });
}

export async function setDriveFolder(
  id: string,
  folder: { id: string; name: string } | null,
  db: Database = getDb(),
): Promise<void> {
  await db
    .update(projects)
    .set({
      driveFolderId: folder?.id ?? null,
      driveFolderName: folder?.name ?? null,
      driveFolderCheckedAt: folder ? sql`now()` : null,
      updatedAt: sql`now()`,
    })
    .where(eq(projects.id, id));
}
