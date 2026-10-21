"use server";

import { refresh } from "next/cache";
import { DriveError } from "@/lib/drive";
import { checkDriveFolder, parseDriveFolderId } from "@/lib/drive-folder";
import { GoogleReconnectRequired } from "@/lib/google-tokens";
import { getProject, parseProjectInput, setDriveFolder, UnknownClient, updateProjectSettings, type ProjectField } from "@/lib/projects";
import { requireUser } from "@/lib/session";
import { formInput, type FieldErrors } from "@/lib/validation";

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
