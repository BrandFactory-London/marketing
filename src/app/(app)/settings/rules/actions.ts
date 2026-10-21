"use server";

import { refresh } from "next/cache";
import { acceptCandidate, dismissCandidate, RuleError } from "@/lib/rules";
import { requireUser } from "@/lib/session";

export type CandidateState = { error?: string; done?: string };

export async function acceptCandidateAction(candidateId: string, _previous: CandidateState, formData: FormData): Promise<CandidateState> {
  await requireUser();
  const [tier, section] = String(formData.get("target") ?? "").split(":");
  try {
    await acceptCandidate(candidateId, { text: String(formData.get("text") ?? ""), tier: tier ?? "", section: section ?? "" });
  } catch (error) {
    if (error instanceof RuleError) return { error: error.message };
    throw error;
  }
  refresh();
  return { done: "Rule accepted." };
}

export async function dismissCandidateAction(candidateId: string): Promise<CandidateState> {
  await requireUser();
  try {
    await dismissCandidate(candidateId);
  } catch (error) {
    if (error instanceof RuleError) return { error: error.message };
    throw error;
  }
  refresh();
  return { done: "Dismissed." };
}
