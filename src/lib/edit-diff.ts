import { diffSentences, diffWords } from "diff";
import type { EditHunk } from "@/db/schema";

// Amir's edits as before and after pairs, sentence by sentence (γ5 orientation Q5). Each run of removed and
// added sentences becomes one hunk; unchanged text is left out. The rule candidates prompt reads these.
export function editHunks(writer: string, approved: string): EditHunk[] {
  const hunks: EditHunk[] = [];
  let before = "";
  let after = "";
  const flush = () => {
    if (before.trim() || after.trim()) hunks.push({ before: before.trim(), after: after.trim() });
    before = "";
    after = "";
  };
  for (const part of diffSentences(normalise(writer), normalise(approved))) {
    if (part.removed) before += part.value;
    else if (part.added) after += part.value;
    else flush();
  }
  flush();
  return hunks;
}

function normalise(text: string): string {
  return text.replace(/\r\n?/g, "\n").replace(/[ \t]+$/gm, "").trim();
}

// How many words an edit changed: the larger of the words removed and the words added, so a one-word swap is 1. The
// small-edit filter (γ7 orientation Q3) reads it.
export function changedWords(before: string, after: string): number {
  let removed = 0;
  let added = 0;
  for (const part of diffWords(normalise(before), normalise(after))) {
    const words = part.value.split(/\s+/).filter(Boolean).length;
    if (part.removed) removed += words;
    else if (part.added) added += words;
  }
  return Math.max(removed, added);
}
