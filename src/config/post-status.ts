// The one list of post statuses (design decision 16, methodology D.3.1). Display words follow
// design/system/README.md; every surface that shows a post reads its word, tone and calendar style here, and the
// Google Calendar mirror reads its event colour here too (γ8 orientation Q3).

// Google Calendar's eleven event colours, by the colorId its API takes.
export const GOOGLE_COLOURS = {
  lavender: "1",
  sage: "2",
  grape: "3",
  flamingo: "4",
  banana: "5",
  tangerine: "6",
  peacock: "7",
  graphite: "8",
  blueberry: "9",
  basil: "10",
  tomato: "11",
} as const;
export type GoogleColour = keyof typeof GOOGLE_COLOURS;

export const POST_STATUSES = [
  { key: "planned", label: "Planned", tone: "neutral", calendar: "planned", google: "graphite" },
  { key: "topic_set", label: "Topic set", tone: "neutral", calendar: "neutral", google: "lavender" },
  { key: "spec_confirmed", label: "Spec ready", tone: "brand", calendar: "brand", google: "peacock" },
  // Shown as Writing or Checking, by generation step (γ4 records the step).
  { key: "generating", label: "Writing", tone: "brand", calendar: "brand", google: "peacock" },
  { key: "in_review", label: "Needs review", tone: "warning", calendar: "warning", google: "banana" },
  // Blueberry, not Peacock, so an approved post stands apart from one being written.
  { key: "approved", label: "Approved", tone: "brand", calendar: "brand", google: "blueberry" },
  { key: "published", label: "Published", tone: "success", calendar: "success", google: "basil" },
  // Decision 16's "flagged": failed the critic twice and came to Amir.
  { key: "flagged", label: "Failed", tone: "danger", calendar: "danger", google: "tomato" },
  // Flamingo, so a rejected post does not read as an empty slot.
  { key: "rejected", label: "Rejected", tone: "neutral", calendar: "rejected", google: "flamingo" },
] as const;

export type PostStatus = (typeof POST_STATUSES)[number]["key"];
export type PostStatusInfo = (typeof POST_STATUSES)[number];
export const POST_STATUS_KEYS = POST_STATUSES.map((item) => item.key) as [PostStatus, ...PostStatus[]];

export const GENERATION_STEPS = { writer: "Writing", critic: "Checking" } as const;
export type GenerationStep = keyof typeof GENERATION_STEPS;

export function isPostStatus(value: unknown): value is PostStatus {
  return typeof value === "string" && POST_STATUSES.some((item) => item.key === value);
}

export function getPostStatus(key: PostStatus): PostStatusInfo {
  return POST_STATUSES.find((item) => item.key === key)!;
}

export function postStatusLabel(key: PostStatus, step?: GenerationStep | null): string {
  if (key === "generating" && step) return GENERATION_STEPS[step];
  return getPostStatus(key).label;
}

// Statuses a slot can be in before any writing starts. Only these take a topic change in γ3.
export const PRE_WRITING_STATUSES: readonly PostStatus[] = ["planned", "topic_set"];

// The Posts page lists posts that have started: a topic or later (γ3 orientation Q10).
export const LISTED_STATUSES: readonly PostStatus[] = POST_STATUS_KEYS.filter((key) => key !== "planned");

// Display lines for a generation, not statuses (γ4 orientation Q6). A post the critic failed after a round
// that still has fix rounds left needs another pass; a run that hit an API error, a refusal or a timeout
// could not finish, and the post goes back to Spec ready so it can be retried.
export const GENERATION_LINES = {
  queued: { label: "Queued", tone: "neutral" },
  anotherPass: { label: "Needs another pass", tone: "warning" },
  couldNotFinish: { label: "Could not finish", tone: "danger" },
  stalled: { label: "Stopped reporting", tone: "danger" },
} as const;

// A spec's own state on the batch page (γ4 orientation Q4). Specs are not posts, so these are not post statuses.
export const SPEC_LINES = {
  drafting: { label: "Drafting spec", tone: "brand" },
  proposed: { label: "To confirm", tone: "warning" },
  confirmed: { label: "Confirmed", tone: "success" },
  superseded: { label: "Replaced", tone: "neutral" },
  failed: { label: "Spec not drafted", tone: "danger" },
} as const;

// Review's own display lines (γ5 orientation Q2). A draft with placeholders, dashes or banned phrases left needs
// Amir before it can be approved; it is still in_review, not a status of its own.
export const REVIEW_LINES = {
  needsInput: { label: "Needs your input", tone: "warning" },
} as const;

// Publishing's display lines (γ6 orientation Q4, Q5). A post Wix has accepted stays approved until the live check
// sees it; only then is it published.
export const PUBLISH_LINES = {
  publishing: { label: "Publishing", tone: "brand" },
  checking: { label: "Checking the live page", tone: "brand" },
  notConfirmed: { label: "Not confirmed live", tone: "warning" },
  failed: { label: "Publish failed", tone: "danger" },
} as const;

// A derivative version's display lines (γ6 orientation Q6). Derivatives are not posts, so these are not statuses.
export const DERIVATIVE_LINES = {
  notGenerated: { label: "Not generated yet", tone: "neutral" },
  writing: { label: GENERATION_STEPS.writer, tone: "brand" },
  notWritten: { label: "Not written", tone: "danger" },
  ready: { label: "Ready to copy", tone: "success" },
} as const;

// Statuses at which a post has a draft to open (γ4 draft view).
export const DRAFTED_STATUSES: readonly PostStatus[] = ["in_review", "flagged", "approved", "published", "rejected"];

// "Missed" is derived, never stored: a slot whose date has passed before writing started (γ3 orientation Q4).
export const MISSED = { label: "Missed", tone: "warning", google: "tangerine" } as const;

export function isMissed(status: PostStatus, slotDate: string, today: string): boolean {
  return PRE_WRITING_STATUSES.includes(status) && slotDate < today;
}
