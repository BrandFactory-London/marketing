import type { IconName } from "@/components/ui/Icon";

export type NavItem = { label: string; href: string; icon: IconName };

// Order and labels follow design/prototype/Nav.dc.html.
export const mainNav: NavItem[] = [
  { label: "Home", href: "/", icon: "home" },
  { label: "Calendar", href: "/calendar", icon: "calendar" },
  { label: "CRM", href: "/crm", icon: "crm" },
  { label: "Projects", href: "/projects", icon: "projects" },
  { label: "Posts", href: "/posts", icon: "posts" },
  { label: "Review queue", href: "/review", icon: "review" },
];

export const settingsNav: NavItem[] = [
  { label: "BrandFactory rules", href: "/settings/rules", icon: "knowledge" },
  { label: "AI models", href: "/settings/models", icon: "models" },
  { label: "Connections", href: "/settings/connections", icon: "connections" },
];

export function isCurrent(href: string, pathname: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

// The four project tabs (Phase 2 handoff, A2). A project opens on its Run plan, the work in hand. Settings moved into
// Details and Sitemap into Knowledge; their old URLs redirect (PROJECT_TAB_REDIRECTS).
export const PROJECT_TABS = [
  { label: "Details", segment: "details" },
  { label: "Run plan", segment: "plan" },
  { label: "Content and performance", segment: "content" },
  { label: "Knowledge", segment: "knowledge" },
] as const;

export const DEFAULT_PROJECT_TAB = "plan";

export const PROJECT_TAB_REDIRECTS = [
  { from: "settings", to: "details" },
  { from: "sitemap", to: "knowledge" },
] as const;

// The Run plan tab carries a badge while the client has sent something Amir has not read (orientation Q6).
export function projectTabs(projectId: string, unseen = 0) {
  return PROJECT_TABS.map((tab) => ({
    label: tab.label,
    href: `/projects/${projectId}/${tab.segment}`,
    badge: tab.segment === "plan" && unseen > 0 ? `${unseen} new from the client` : null,
  }));
}
