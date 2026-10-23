import { createHash } from "node:crypto";
import { getPostStatus, GOOGLE_COLOURS, isMissed, MISSED, postStatusLabel, type GenerationStep, type PostStatus } from "@/config/post-status";
import { CONTENT_TYPES, type DerivedType } from "@/config/content-types";
import { derivedSlotLine, type DerivedVersionStatus } from "@/config/run-status";
import { addDays } from "./dates";

// A post's Google Calendar event (γ8 orientation Q3, Q4). Pure: the same post always gives the same event, so its hash
// says whether the calendar is behind. Built on post records and their dates, not packages, so Phase 2's runs and
// derived posts reuse it.

export const APP_TAG = "brandfactory-marketing";


export type CalendarPost = {
  postId: string;
  status: PostStatus;
  generationStep: GenerationStep | null;
  slotDate: string;
  topic: string | null;
  liveUrl: string | null;
  clientName: string;
  clientShortName: string | null;
  projectName: string;
  specNotes: string | null;
};

export type CalendarEvent = {
  id: string;
  summary: string;
  description: string;
  colorId: string;
  start: { date: string };
  end: { date: string };
  transparency: "transparent";
  status: "confirmed";
  extendedProperties: { private: { bfmApp: string; bfmPostId: string } };
};

// Google takes an event ID we choose, in lower-case base32hex (0 to 9, a to v), 5 to 1024 characters. "bfm" and the
// post's UUID without hyphens fit, so a retried insert finds the same event instead of making a second one.
export function eventIdFor(postId: string): string {
  return `bfm${postId.replace(/-/g, "").toLowerCase()}`;
}

// A derived slot's event (Phase 2 A1): "bfmd" and the slot's UUID, so it never meets an SEO post's ID.
export function derivedEventIdFor(slotId: string): string {
  return `bfmd${slotId.replace(/-/g, "").toLowerCase()}`;
}

export function shortName(clientName: string, short: string | null): string {
  return short?.trim() || clientName.trim().split(/\s+/)[0] || clientName;
}

export function buildEvent(post: CalendarPost, options: { today: string; appUrl: string | null }): CalendarEvent {
  const missed = isMissed(post.status, post.slotDate, options.today);
  const empty = post.status === "planned" || !post.topic;
  const label = missed ? MISSED.label : postStatusLabel(post.status, post.generationStep);
  const what = empty ? (missed ? "Missed slot" : "Planned slot") : post.topic!;
  const colour = missed ? MISSED.google : getPostStatus(post.status).google;
  const link = options.appUrl ? `${options.appUrl.replace(/\/+$/, "")}${empty ? "/calendar" : `/posts/${post.postId}`}` : null;
  const description = [
    `Status: ${label}`,
    `Project: ${post.projectName}`,
    post.specNotes?.trim() ? `Notes: ${post.specNotes.trim()}` : null,
    link ? `Open in BrandFactory Marketing: ${link}` : null,
    post.status === "published" && post.liveUrl ? `Live post: ${post.liveUrl}` : null,
  ]
    .filter(Boolean)
    .join("\n");
  return {
    id: eventIdFor(post.postId),
    summary: `${shortName(post.clientName, post.clientShortName)} · ${CONTENT_TYPES.seo.short} · ${what}`,
    description,
    colorId: GOOGLE_COLOURS[colour],
    start: { date: post.slotDate },
    end: { date: addDays(post.slotDate, 1) },
    // An all-day slot does not block Amir's time.
    transparency: "transparent",
    status: "confirmed",
    extendedProperties: { private: { bfmApp: APP_TAG, bfmPostId: post.postId } },
  };
}

// A derived slot's event (Phase 2 A1): its own date, the channel's short name and its SEO post's topic, so the calendar
// shows what it will be made from.
export type CalendarDerivedSlot = {
  slotId: string;
  contentType: DerivedType;
  slotDate: string;
  versionStatus: DerivedVersionStatus;
  parentPostId: string;
  parentTopic: string | null;
  clientName: string;
  clientShortName: string | null;
  projectName: string;
};

export function buildDerivedEvent(slot: CalendarDerivedSlot, options: { today: string; appUrl: string | null }): CalendarEvent {
  const line = derivedSlotLine(slot.versionStatus, slot.slotDate, options.today);
  const type = CONTENT_TYPES[slot.contentType];
  const link = options.appUrl ? `${options.appUrl.replace(/\/+$/, "")}${slot.parentTopic ? `/posts/${slot.parentPostId}` : "/calendar"}` : null;
  const description = [
    `Status: ${line.label}`,
    `Project: ${slot.projectName}`,
    `From the SEO post: ${slot.parentTopic ?? "no topic yet"}`,
    link ? `Open in BrandFactory Marketing: ${link}` : null,
  ]
    .filter(Boolean)
    .join("\n");
  return {
    id: derivedEventIdFor(slot.slotId),
    summary: `${shortName(slot.clientName, slot.clientShortName)} · ${type.short} · ${slot.parentTopic ?? "Planned slot"}`,
    description,
    colorId: GOOGLE_COLOURS[line.google],
    start: { date: slot.slotDate },
    end: { date: addDays(slot.slotDate, 1) },
    transparency: "transparent",
    status: "confirmed",
    // bfmPostId holds the record's own ID for both kinds, so a resync can match any app event to its row.
    extendedProperties: { private: { bfmApp: APP_TAG, bfmPostId: slot.slotId } },
  };
}

// The fields the app owns on an event. An event that differs in any of them is patched.
export function ownedFields(event: Pick<CalendarEvent, "summary" | "description" | "colorId" | "start" | "end">) {
  return { summary: event.summary, description: event.description ?? "", colorId: event.colorId ?? "", start: event.start?.date ?? "", end: event.end?.date ?? "" };
}

export function eventHash(event: CalendarEvent): string {
  return createHash("sha256").update(JSON.stringify(ownedFields(event))).digest("hex").slice(0, 32);
}
