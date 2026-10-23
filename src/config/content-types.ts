import { CHANNELS } from "./knowledge";

// The kinds of content a run schedules (Phase 2 session A, orientation Q2, Q8): SEO posts, and the posts derived from
// them on their own days. The one list every run screen, the cadence engine and the calendar read (D.3.1). Instagram
// is Phase 3.

export const CONTENT_TYPES = {
  seo: { label: "SEO post", short: "SEO", channel: "blog" },
  gmb: { label: CHANNELS.gmb.label, short: "GBP", channel: "gmb" },
  linkedin: { label: CHANNELS.linkedin.label, short: "LinkedIn", channel: "linkedin" },
  facebook: { label: CHANNELS.facebook.label, short: "Facebook", channel: "facebook" },
  pinterest: { label: CHANNELS.pinterest.label, short: "Pinterest", channel: "pinterest" },
} as const;

export type ContentType = keyof typeof CONTENT_TYPES;
export type DerivedType = Exclude<ContentType, "seo">;

export const CONTENT_TYPE_KEYS = Object.keys(CONTENT_TYPES) as [ContentType, ...ContentType[]];
export const DERIVED_TYPES = CONTENT_TYPE_KEYS.filter((key): key is DerivedType => key !== "seo");

export function isContentType(value: unknown): value is ContentType {
  return typeof value === "string" && value in CONTENT_TYPES;
}

export function isDerivedType(value: unknown): value is DerivedType {
  return isContentType(value) && value !== "seo";
}
