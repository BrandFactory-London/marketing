import { APPROVAL_BLOCKING_CHECKS, findPlaceholders, type CheckIssue, type CheckResult, type Placeholder } from "./checks";

// Review's rules that the editor applies live in the browser and the server applies again on save and approve
// (γ5 orientation Q1, Q2, Q7). Pure, so both sides share them.

// Amir edits the title, excerpt and body separately; the writer and the checks read one Markdown text.
export type PostText = { title: string; excerpt: string; body: string };

export function splitDraft(markdown: string): PostText {
  const title = /^# (.+)$/m.exec(markdown)?.[1].trim() ?? "";
  const excerpt = /^Excerpt:\s*(.*)$/m.exec(markdown)?.[1].trim() ?? "";
  const body = markdown
    .replace(/^# .+$/m, "")
    .replace(/^Excerpt:.*$/m, "")
    .trim();
  return { title, excerpt, body };
}

export function composeMarkdown(text: PostText): string {
  return `# ${text.title.trim()}\n\nExcerpt: ${text.excerpt.trim()}\n\n${text.body.trim()}\n`;
}

export function sameText(a: PostText, b: PostText): boolean {
  return a.title.trim() === b.title.trim() && a.excerpt.trim() === b.excerpt.trim() && a.body.trim() === b.body.trim();
}

export type ApprovalState = {
  placeholders: Placeholder[];
  // Dashes and banned phrases: they block Approve even when Amir typed them (orientation approval).
  blocking: CheckIssue[];
  // Every other failed check: shown, recorded on the approve event, but not blocking.
  warnings: CheckIssue[];
  canApprove: boolean;
  reason: string | null;
};

export function approvalState(markdown: string, checks: Pick<CheckResult, "issues">): ApprovalState {
  const placeholders = findPlaceholders(markdown);
  const blocking = checks.issues.filter((issue) => APPROVAL_BLOCKING_CHECKS.includes(issue.check));
  const warnings = checks.issues.filter((issue) => !APPROVAL_BLOCKING_CHECKS.includes(issue.check));
  const reasons = [
    placeholders.length > 0 ? `fill in ${count(placeholders.length, "placeholder")}` : null,
    blocking.length > 0 ? `remove ${count(blocking.length, "dash or banned phrase", "dashes or banned phrases")}` : null,
  ].filter(Boolean);
  return {
    placeholders,
    blocking,
    warnings,
    canApprove: reasons.length === 0,
    reason: reasons.length > 0 ? `${capitalise(reasons.join(" and "))} to approve.` : null,
  };
}

function count(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

function capitalise(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

// ---- Slugs (γ6 publishes with them) ----

export const SLUG_MAX = 80;
const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export function slugify(title: string): string {
  const slug = title
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (slug.length <= SLUG_MAX) return slug;
  return slug.slice(0, SLUG_MAX).replace(/-[^-]*$/, "") || slug.slice(0, SLUG_MAX);
}

export function slugFormatProblem(slug: string): string | null {
  if (!slug) return "Enter a slug.";
  if (slug.length > SLUG_MAX) return `Keep the slug to ${SLUG_MAX} characters.`;
  if (!SLUG.test(slug)) return "Use lower-case letters, numbers and single hyphens only.";
  return null;
}
