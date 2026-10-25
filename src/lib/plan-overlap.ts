// The planner's check against repeating a topic (orientation Q5): a planned title is "close to" a covered title or page
// when more than 60% of its meaningful words are in it. Pure, so the Run plan and the tests share it.

export const OVERLAP_LIMIT = 0.6;

const STOP_WORDS = new Set(
  "a an and are as at be by can do does for from how i in into is it its of on or our should the their them this to us vs we what when where which who why will with without you your".split(" "),
);

export function significantWords(text: string): string[] {
  const words = text
    .toLowerCase()
    .replace(/[‘’']/g, "")
    .split(/[^a-z0-9£]+/)
    .filter((word) => word.length > 1 && !STOP_WORDS.has(word))
    // Plurals count as the same word: "trays" and "tray".
    .map((word) => (word.length > 3 && word.endsWith("s") && !word.endsWith("ss") ? word.slice(0, -1) : word));
  return [...new Set(words)];
}

export function overlap(planned: string, covered: string): number {
  const mine = significantWords(planned);
  if (mine.length === 0) return 0;
  const theirs = new Set(significantWords(covered));
  return mine.filter((word) => theirs.has(word)).length / mine.length;
}

// The covered title this one is closest to, when it is over the limit.
export function closeTo(planned: string, covered: readonly string[]): string | null {
  let best: { title: string; score: number } | null = null;
  for (const title of covered) {
    const score = overlap(planned, title);
    if (score > OVERLAP_LIMIT && (!best || score > best.score)) best = { title, score };
  }
  return best?.title ?? null;
}
