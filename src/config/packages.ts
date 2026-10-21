// The one list of marketing packages and project statuses (design decision 15, methodology D.3.1).
// The CRM, project forms, cards and γ3's slot generator all read from here.

export const PACKAGES = [
  // Weekdays use JavaScript's numbering: 1 is Monday, 5 is Friday.
  { key: "entry", label: "Entry", postsPerWeek: 1, weekdays: [2] },
  { key: "mid", label: "Mid", postsPerWeek: 2, weekdays: [2, 4] },
  { key: "premium", label: "Premium", postsPerWeek: 3, weekdays: [1, 3, 5] },
] as const;

export type PackageKey = (typeof PACKAGES)[number]["key"];
export type Package = (typeof PACKAGES)[number];

export const PACKAGE_KEYS = PACKAGES.map((item) => item.key) as [PackageKey, ...PackageKey[]];

export function isPackageKey(value: unknown): value is PackageKey {
  return typeof value === "string" && PACKAGES.some((item) => item.key === value);
}

export function getPackage(key: PackageKey): Package {
  return PACKAGES.find((item) => item.key === key)!;
}

// "Entry · 1 post a week"
export function packageSummary(key: PackageKey): string {
  const item = getPackage(key);
  return `${item.label} · ${item.postsPerWeek} ${item.postsPerWeek === 1 ? "post" : "posts"} a week`;
}

// "Entry · 1 SEO post a week", for the package select.
export function packageOption(key: PackageKey): string {
  const item = getPackage(key);
  return `${item.label} · ${item.postsPerWeek} SEO ${item.postsPerWeek === 1 ? "post" : "posts"} a week`;
}

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
