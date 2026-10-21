// The one list of post statuses (design decision 16, methodology D.3.1). Display words follow
// design/system/README.md; every surface that shows a post reads its word, tone and calendar style here.

export const POST_STATUSES = [
  { key: "planned", label: "Planned", tone: "neutral", calendar: "planned" },
  { key: "topic_set", label: "Topic set", tone: "neutral", calendar: "neutral" },
  { key: "spec_confirmed", label: "Spec ready", tone: "brand", calendar: "brand" },
  // Shown as Writing or Checking, by generation step (γ4 records the step).
  { key: "generating", label: "Writing", tone: "brand", calendar: "brand" },
  { key: "in_review", label: "Needs review", tone: "warning", calendar: "warning" },
  { key: "approved", label: "Approved", tone: "brand", calendar: "brand" },
  { key: "published", label: "Published", tone: "success", calendar: "success" },
  // Decision 16's "flagged": failed the critic twice and came to Amir.
  { key: "flagged", label: "Failed", tone: "danger", calendar: "danger" },
  { key: "rejected", label: "Rejected", tone: "neutral", calendar: "rejected" },
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

// "Missed" is derived, never stored: a slot whose date has passed before writing started (γ3 orientation Q4).
export const MISSED = { label: "Missed", tone: "warning" } as const;

export function isMissed(status: PostStatus, slotDate: string, today: string): boolean {
  return PRE_WRITING_STATUSES.includes(status) && slotDate < today;
}
