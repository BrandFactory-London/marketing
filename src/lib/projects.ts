import "server-only";
import { asc, eq, sql } from "drizzle-orm";
import { getDb, type Database } from "@/db/client";
import { clients, projects } from "@/db/schema";
import { isPackageKey, isProjectStatus, isPublishingTarget, type PackageKey, type ProjectStatus, type PublishingTarget } from "@/config/packages";
import { isUuid, normaliseSiteUrl, optionalText, type FormInput, type Parsed } from "./validation";

export type Project = typeof projects.$inferSelect;
export type ProjectWithClient = Project & { clientName: string };

export type ProjectInput = {
  clientId: string;
  name: string;
  siteUrl: string;
  package: PackageKey;
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
  if (!isPackageKey(input.package)) errors.package = "Choose a package.";
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
      package: input.package as PackageKey,
      status: input.status as ProjectStatus,
      publishingTarget: target as PublishingTarget,
    },
  };
}

const withClient = {
  project: projects,
  clientName: clients.name,
};

function flatten(row: { project: Project; clientName: string }): ProjectWithClient {
  return { ...row.project, clientName: row.clientName };
}

// Ordered by client, then project, for the grouped Projects page and the Home gallery.
export async function listProjects(db: Database = getDb()): Promise<ProjectWithClient[]> {
  const rows = await db
    .select(withClient)
    .from(projects)
    .innerJoin(clients, eq(clients.id, projects.clientId))
    .orderBy(asc(sql`lower(${clients.name})`), asc(sql`lower(${projects.name})`), asc(projects.createdAt));
  return rows.map(flatten);
}

export async function listClientProjects(clientId: string, db: Database = getDb()): Promise<ProjectWithClient[]> {
  if (!isUuid(clientId)) return [];
  const rows = await db
    .select(withClient)
    .from(projects)
    .innerJoin(clients, eq(clients.id, projects.clientId))
    .where(eq(projects.clientId, clientId))
    .orderBy(asc(sql`lower(${projects.name})`), asc(projects.createdAt));
  return rows.map(flatten);
}

export async function getProject(id: string, db: Database = getDb()): Promise<ProjectWithClient | null> {
  if (!isUuid(id)) return null;
  const [row] = await db.select(withClient).from(projects).innerJoin(clients, eq(clients.id, projects.clientId)).where(eq(projects.id, id));
  return row ? flatten(row) : null;
}

export class UnknownClient extends Error {
  constructor() {
    super("That client no longer exists.");
    this.name = "UnknownClient";
  }
}

export async function createProject(value: ProjectInput, db: Database = getDb()): Promise<Project> {
  const [client] = await db.select({ id: clients.id }).from(clients).where(eq(clients.id, value.clientId));
  if (!client) throw new UnknownClient();
  const [row] = await db.insert(projects).values(value).returning();
  return row;
}

// Saves the Settings tab. status_changed_at moves only when the status actually changes; γ3 uses it.
export async function updateProjectSettings(id: string, value: ProjectInput, db: Database = getDb()): Promise<Project | null> {
  if (!isUuid(id)) return null;
  const [client] = await db.select({ id: clients.id }).from(clients).where(eq(clients.id, value.clientId));
  if (!client) throw new UnknownClient();
  const [row] = await db
    .update(projects)
    .set({
      ...value,
      statusChangedAt: sql`case when ${projects.status} = ${value.status} then ${projects.statusChangedAt} else now() end`,
      updatedAt: sql`now()`,
    })
    .where(eq(projects.id, id))
    .returning();
  return row ?? null;
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
