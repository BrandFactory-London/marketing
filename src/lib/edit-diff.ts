import { diffSentences } from "diff";
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
