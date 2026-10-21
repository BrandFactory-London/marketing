"use server";

import { refresh } from "next/cache";
import { requireUser } from "@/lib/session";
import { updateModelSettings } from "@/lib/settings";

export type ModelsState = { saved?: boolean; error?: string };

export async function saveModelsAction(_previous: ModelsState, formData: FormData): Promise<ModelsState> {
  await requireUser();
  try {
    await updateModelSettings({
      writerModel: formData.get("writerModel"),
      criticModel: formData.get("criticModel"),
      derivativeModel: formData.get("derivativeModel"),
    });
  } catch (error) {
    return { error: error instanceof Error ? error.message : "The models could not be saved." };
  }
  refresh();
  return { saved: true };
}
