"use server";

import { refresh } from "next/cache";
import type { CheckResult } from "@/lib/checks";
import { approvePost, parsePostText, rejectPost, reopenPost, ReviewError, savePublishingDetails, saveVersion } from "@/lib/review";
import { requireUser } from "@/lib/session";
import { isUuid, optionalText } from "@/lib/validation";

export type TextInput = { title: string; excerpt: string; body: string };
export type ReviewActionResult = { ok: true; message?: string; checks?: CheckResult } | { ok: false; message: string };

function failure(error: unknown): ReviewActionResult {
  if (error instanceof ReviewError) return { ok: false, message: error.message };
  throw error;
}

export async function saveDraftAction(postId: string, input: TextInput): Promise<ReviewActionResult> {
  await requireUser();
  try {
    const { saved, checks } = await saveVersion(postId, parsePostText(input));
    refresh();
    return { ok: true, message: saved ? "Draft saved." : "No changes to save.", checks };
  } catch (error) {
    return failure(error);
  }
}

export async function approveAction(postId: string, input: TextInput): Promise<ReviewActionResult> {
  await requireUser();
  try {
    await approvePost(postId, parsePostText(input));
  } catch (error) {
    return failure(error);
  }
  refresh();
  return { ok: true, message: "Post approved." };
}

export async function rejectAction(postId: string, note: string): Promise<ReviewActionResult> {
  await requireUser();
  try {
    await rejectPost(postId, note);
  } catch (error) {
    return failure(error);
  }
  refresh();
  return { ok: true, message: "Post rejected." };
}

export async function reopenAction(postId: string): Promise<ReviewActionResult> {
  await requireUser();
  try {
    await reopenPost(postId);
  } catch (error) {
    return failure(error);
  }
  refresh();
  return { ok: true, message: "Post reopened for editing." };
}

export type DetailsState = { message?: string; error?: string; saved?: boolean };

export async function detailsAction(postId: string, _previous: DetailsState, formData: FormData): Promise<DetailsState> {
  await requireUser();
  const pillar = optionalText(formData.get("pillarId"));
  try {
    await savePublishingDetails(postId, { slug: String(formData.get("slug") ?? ""), pillarId: pillar && isUuid(pillar) ? pillar : null });
  } catch (error) {
    if (error instanceof ReviewError) return { error: error.message };
    throw error;
  }
  refresh();
  return { saved: true, message: "Publishing details saved." };
}
