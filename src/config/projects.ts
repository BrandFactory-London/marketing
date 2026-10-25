// The one list of project statuses, client statuses and publishing targets (methodology D.3.1). The CRM, project forms
// and cards read from here. Marketing packages were replaced by run presets in Phase 2 (src/config/run-presets.ts).

export const PROJECT_STATUSES = [
  { key: "active", label: "Active", tone: "success" },
  { key: "paused", label: "Paused", tone: "neutral" },
] as const;

export type ProjectStatus = (typeof PROJECT_STATUSES)[number]["key"];
export const PROJECT_STATUS_KEYS = PROJECT_STATUSES.map((item) => item.key) as [ProjectStatus, ...ProjectStatus[]];

export function isProjectStatus(value: unknown): value is ProjectStatus {
  return typeof value === "string" && PROJECT_STATUSES.some((item) => item.key === value);
}

export function getProjectStatus(key: ProjectStatus) {
  return PROJECT_STATUSES.find((item) => item.key === key)!;
}

// Derived for the CRM, never stored: Active if any project is active, Paused if all are paused,
// Set up if the client has no projects.
export const CLIENT_STATUSES = {
  active: { label: "Active", tone: "success" },
  paused: { label: "Paused", tone: "neutral" },
  setup: { label: "Set up", tone: "neutral" },
} as const;

export type ClientStatus = keyof typeof CLIENT_STATUSES;

export function clientStatus(projectStatuses: ProjectStatus[]): ClientStatus {
  if (projectStatuses.length === 0) return "setup";
  return projectStatuses.includes("active") ? "active" : "paused";
}

// Phase 1 publishes to the Wix Blog only. γ6 adds its credentials; Phase 3 adds the BrandFactory posts feed.
export const PUBLISHING_TARGETS = [{ key: "wix_blog", label: "Wix Blog" }] as const;
export type PublishingTarget = (typeof PUBLISHING_TARGETS)[number]["key"];
export const PUBLISHING_TARGET_KEYS = PUBLISHING_TARGETS.map((item) => item.key) as [PublishingTarget, ...PublishingTarget[]];

export function isPublishingTarget(value: unknown): value is PublishingTarget {
  return typeof value === "string" && PUBLISHING_TARGETS.some((item) => item.key === value);
}

export function publishingTargetLabel(key: PublishingTarget): string {
  return PUBLISHING_TARGETS.find((item) => item.key === key)!.label;
}
