import "server-only";
import { asc, eq, sql } from "drizzle-orm";
import { getDb, type Database } from "@/db/client";
import { clients, projects } from "@/db/schema";
import { clientStatus, type ClientStatus, type PackageKey, type ProjectStatus } from "@/config/packages";
import { isEmail, isUuid, optionalText, type FormInput, type Parsed } from "./validation";

export type ClientInput = { name: string; shortName?: string | null; mainContact: string | null; email: string | null; phone: string | null };
export type ClientField = keyof ClientInput;
export type Client = typeof clients.$inferSelect;

export function parseClientInput(input: FormInput): Parsed<ClientInput, ClientField> {
  const name = optionalText(input.name);
  const email = optionalText(input.email);
  const shortName = optionalText(input.shortName);
  const errors: Partial<Record<ClientField, string>> = {};
  if (!name) errors.name = "Enter the client's name.";
  else if (name.length > 200) errors.name = "Keep the name under 200 characters.";
  if (shortName && shortName.length > 30) errors.shortName = "Keep the short name under 30 characters.";
  if (email && !isEmail(email)) errors.email = "Enter an email address such as name@business.com.";
  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return {
    ok: true,
    value: { name: name!, shortName, mainContact: optionalText(input.mainContact), email, phone: optionalText(input.phone) },
  };
}

export type ClientProjectSummary = { id: string; name: string; package: PackageKey; status: ProjectStatus };
export type ClientListItem = Client & { projects: ClientProjectSummary[]; status: ClientStatus };

export async function listClients(db: Database = getDb()): Promise<ClientListItem[]> {
  const rows = await db.select().from(clients).orderBy(asc(sql`lower(${clients.name})`), asc(clients.createdAt));
  const projectRows = await db
    .select({
      id: projects.id,
      clientId: projects.clientId,
      name: projects.name,
      package: projects.package,
      status: projects.status,
    })
    .from(projects)
    .orderBy(asc(sql`lower(${projects.name})`));
  return rows.map((client) => {
    const own = projectRows
      .filter((project) => project.clientId === client.id)
      .map(({ id, name, package: pkg, status }) => ({ id, name, package: pkg, status }));
    return { ...client, projects: own, status: clientStatus(own.map((project) => project.status)) };
  });
}

export async function getClient(id: string, db: Database = getDb()): Promise<Client | null> {
  if (!isUuid(id)) return null;
  const [row] = await db.select().from(clients).where(eq(clients.id, id));
  return row ?? null;
}

export async function createClient(value: ClientInput, db: Database = getDb()): Promise<Client> {
  const [row] = await db.insert(clients).values(value).returning();
  return row;
}

export async function updateClient(id: string, value: ClientInput, db: Database = getDb()): Promise<Client | null> {
  if (!isUuid(id)) return null;
  const [row] = await db
    .update(clients)
    .set({ ...value, updatedAt: sql`now()` })
    .where(eq(clients.id, id))
    .returning();
  return row ?? null;
}
