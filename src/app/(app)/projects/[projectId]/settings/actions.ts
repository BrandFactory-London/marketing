"use server";

import { refresh } from "next/cache";
import { DriveError } from "@/lib/drive";
import { checkDriveFolder, parseDriveFolderId } from "@/lib/drive-folder";
import { GoogleReconnectRequired } from "@/lib/google-tokens";
import { getProject, parseProjectInput, setDriveFolder, UnknownClient, updateProjectSettings, type ProjectField } from "@/lib/projects";
import { addPillar, DuplicatePillar, parsePillarInput, removePillar, type PillarField } from "@/lib/pillars";
import { requireUser } from "@/lib/session";
import { formInput, type FieldErrors } from "@/lib/validation";
import { WixError, type WixMember } from "@/lib/wix";
import {
  checkWixConnection,
  chooseWixMember,
  describeWixError,
  listWixMembers,
  parseWixCredentials,
  removeWixCredentials,
  saveWixCredentials,
  WixSetupError,
  type WixCheckResult,
  type WixCredentialsField,
} from "@/lib/wix-credentials";

export type ProjectSettingsState = { errors?: FieldErrors<ProjectField>; message?: string; values?: Record<string, string>; saved?: boolean };

function echo(formData: FormData): Record<string, string> {
  return Object.fromEntries([...formData.entries()].filter(([key]) => !key.startsWith("$")).map(([key, value]) => [key, String(value)]));
}

export async function updateProjectSettingsAction(projectId: string, _previous: ProjectSettingsState, formData: FormData): Promise<ProjectSettingsState> {
  await requireUser();
  const parsed = parseProjectInput(formInput(formData));
  if (!parsed.ok) return { errors: parsed.errors, values: echo(formData) };
  try {
    const project = await updateProjectSettings(projectId, parsed.value);
    if (!project) return { message: "This project no longer exists.", values: echo(formData) };
  } catch (error) {
    if (error instanceof UnknownClient) return { errors: { clientId: error.message }, values: echo(formData) };
    throw error;
  }
  refresh();
  return { saved: true };
}

export type DriveFolderState = { error?: string; value?: string; found?: { name: string; fileCount: number; more: boolean } };

// The folder is saved only once Google confirms it is a folder the signed-in account can list (γ2 orientation Q10).
export async function saveDriveFolderAction(projectId: string, _previous: DriveFolderState, formData: FormData): Promise<DriveFolderState> {
  const user = await requireUser();
  const value = String(formData.get("driveFolder") ?? "").trim();
  if (!value) return { error: "Paste a Google Drive folder link or ID.", value };
  const folderId = parseDriveFolderId(value);
  if (!folderId) return { error: "That is not a Google Drive folder link or ID. Copy the link from the folder's Share menu.", value };
  if (!(await getProject(projectId))) return { error: "This project no longer exists.", value };

  try {
    const folder = await checkDriveFolder(user.id, folderId);
    await setDriveFolder(projectId, { id: folder.id, name: folder.name });
    refresh();
    return { found: { name: folder.name, fileCount: folder.fileCount, more: folder.more } };
  } catch (error) {
    if (error instanceof GoogleReconnectRequired) {
      return { error: `${error.message} Reconnect Google in Settings, Connections, then try again.`, value };
    }
    if (error instanceof DriveError) return { error: error.message, value };
    console.error("Drive folder check failed:", error);
    return { error: "The folder could not be checked. Try again in a moment.", value };
  }
}

export async function removeDriveFolderAction(projectId: string): Promise<void> {
  await requireUser();
  await setDriveFolder(projectId, null);
  refresh();
}

export type PillarState = { errors?: FieldErrors<PillarField>; values?: Record<string, string>; added?: string };

export async function addPillarAction(projectId: string, _previous: PillarState, formData: FormData): Promise<PillarState> {
  await requireUser();
  const parsed = parsePillarInput(formInput(formData));
  if (!parsed.ok) return { errors: parsed.errors, values: echo(formData) };
  if (!(await getProject(projectId))) return { errors: { label: "This project no longer exists." }, values: echo(formData) };
  try {
    await addPillar(projectId, parsed.value);
  } catch (error) {
    if (error instanceof DuplicatePillar) return { errors: { slug: error.message }, values: echo(formData) };
    throw error;
  }
  refresh();
  return { added: parsed.value.label };
}

export async function removePillarAction(projectId: string, pillarId: string): Promise<void> {
  await requireUser();
  await removePillar(projectId, pillarId);
  refresh();
}

// ---- Wix credentials (design decision 6, γ6 orientation Q1) ----

export type WixState = { errors?: FieldErrors<WixCredentialsField>; message?: string; saved?: boolean; check?: WixCheckResult; accountId?: string; siteId?: string };

// Saves the credentials, then runs the connection check straight away so Amir sees whether Wix accepts them.
export async function saveWixCredentialsAction(projectId: string, _previous: WixState, formData: FormData): Promise<WixState> {
  await requireUser();
  const input = formInput(formData);
  const echoIds = { accountId: String(input.accountId ?? ""), siteId: String(input.siteId ?? "") };
  const parsed = parseWixCredentials(input);
  if (!parsed.ok) return { errors: parsed.errors, ...echoIds };
  try {
    await saveWixCredentials(projectId, parsed.value);
  } catch (error) {
    if (error instanceof WixSetupError) return { message: error.message, ...echoIds };
    throw error;
  }
  const check = await runWixCheck(projectId);
  refresh();
  return { saved: true, check };
}

async function runWixCheck(projectId: string): Promise<WixCheckResult> {
  try {
    return await checkWixConnection(projectId);
  } catch (error) {
    if (error instanceof WixSetupError) return { ok: false, message: error.message };
    console.error("Wix check failed:", error);
    return { ok: false, message: "The check could not run. Try again in a moment." };
  }
}

export async function checkWixAction(projectId: string): Promise<WixCheckResult> {
  await requireUser();
  const result = await runWixCheck(projectId);
  refresh();
  return result;
}

export async function removeWixCredentialsAction(projectId: string): Promise<void> {
  await requireUser();
  await removeWixCredentials(projectId);
  refresh();
}

export type WixMembersState = { members?: WixMember[]; error?: string; chosen?: string };

export async function loadWixMembersAction(projectId: string): Promise<WixMembersState> {
  await requireUser();
  try {
    return { members: await listWixMembers(projectId) };
  } catch (error) {
    if (error instanceof WixSetupError) return { error: error.message };
    if (error instanceof WixError) return { error: `Wix did not list the members. ${describeWixError(error)}` };
    console.error("Wix members failed:", error);
    return { error: "The members could not be loaded. Try again in a moment." };
  }
}

export async function chooseWixMemberAction(projectId: string, memberId: string): Promise<WixMembersState> {
  await requireUser();
  try {
    const member = await chooseWixMember(projectId, memberId);
    refresh();
    return { chosen: member.nickname };
  } catch (error) {
    if (error instanceof WixSetupError) return { error: error.message };
    if (error instanceof WixError) return { error: `Wix did not list the members. ${describeWixError(error)}` };
    throw error;
  }
}
