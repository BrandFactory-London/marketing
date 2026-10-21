"use server";

import { refresh } from "next/cache";
import { getClient } from "@/lib/clients";
import { saveKnowledge, type KnowledgeScope } from "@/lib/knowledge";
import { getProject } from "@/lib/projects";
import { requireUser } from "@/lib/session";
import { formInput } from "@/lib/validation";

export type KnowledgeActionState =
  | { status: "idle" }
  | { status: "saved"; version: number }
  | { status: "unchanged" }
  | { status: "error"; message: string };

// Saves a knowledge tier as a new version. The scope is bound by the page, but a Server Action can be
// called directly, so the owner is checked again here.
export async function saveKnowledgeAction(scope: KnowledgeScope, _previous: KnowledgeActionState, formData: FormData): Promise<KnowledgeActionState> {
  await requireUser();
  const exists =
    scope.tier === "agency" ||
    (scope.tier === "client" && (await getClient(scope.clientId))) ||
    (scope.tier === "project" && (await getProject(scope.projectId)));
  if (!exists) return { status: "error", message: "This knowledge no longer has an owner. Reload the page." };

  try {
    const result = await saveKnowledge(scope, formInput(formData));
    if (result.status === "unchanged") return { status: "unchanged" };
    refresh();
    return { status: "saved", version: result.version.version };
  } catch (error) {
    console.error("Knowledge save failed:", error);
    return { status: "error", message: "The knowledge could not be saved. Try again; your text is still in the editor." };
  }
}
