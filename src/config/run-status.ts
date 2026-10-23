import { DERIVATIVE_LINES, getPostStatus, MISSED, type GoogleColour } from "./post-status";

// Runs' own words (Phase 2 session A, orientation Q8). Post statuses stay in post-status.ts; these are the run, slot and
// plan words every run surface reads, so one vocabulary drives them all (D.3.1). A3 and A4 add plan, client and
// generation lines here.

export const RUN_STATUSES = [
  { key: "setting_up", label: "Setting up", tone: "neutral" },
  { key: "planning", label: "Planning", tone: "brand" },
  { key: "plan_approved", label: "Plan approved", tone: "brand" },
  { key: "active", label: "Active", tone: "success" },
] as const;

export type RunStatus = (typeof RUN_STATUSES)[number]["key"];
export const RUN_STATUS_KEYS = RUN_STATUSES.map((item) => item.key) as [RunStatus, ...RunStatus[]];

// Finished is worked out from the end date, never stored.
export const RUN_FINISHED = { label: "Finished", tone: "neutral" } as const;

export function runStatusInfo(status: RunStatus, endsOn: string, today: string): { label: string; tone: string } {
  if (endsOn < today) return RUN_FINISHED;
  return RUN_STATUSES.find((item) => item.key === status)!;
}

// A derived slot before any version exists (orientation Q2). After that it reads the derivative lines. Each line carries
// its Google Calendar colour too, matching the post statuses' colours for the same stage.
export const DERIVED_SLOT_LINES = {
  planned: { label: getPostStatus("planned").label, tone: "neutral", google: "graphite" },
} as const;

export type DerivedVersionStatus = "writing" | "ready" | "failed" | null;

export function derivedSlotLine(versionStatus: DerivedVersionStatus, slotDate: string, today: string): { label: string; tone: "neutral" | "brand" | "success" | "warning" | "danger"; google: GoogleColour } {
  if (versionStatus === "writing") return { ...DERIVATIVE_LINES.writing, google: "peacock" };
  if (versionStatus === "ready") return { ...DERIVATIVE_LINES.ready, google: "basil" };
  if (versionStatus === "failed") return { ...DERIVATIVE_LINES.notWritten, google: "tomato" };
  if (slotDate < today) return { label: MISSED.label, tone: MISSED.tone, google: MISSED.google };
  return DERIVED_SLOT_LINES.planned;
}

// A post the backstop could not place in any run (orientation Q3).
export const OUTSIDE_RUN = { label: "Outside any run", tone: "warning" } as const;
