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

// Project page tabs, in the prototype's order (design/prototype/Project.dc.html). In Phase 1 a project
// opens on Knowledge, because Content and performance stays empty until Phase 2 (γ2 orientation Q9).
export const PROJECT_TABS = [
  { label: "Content and performance", segment: "content" },
  { label: "Sitemap", segment: "sitemap" },
  { label: "Run plan", segment: "plan" },
  { label: "Knowledge", segment: "knowledge" },
  { label: "Settings", segment: "settings" },
] as const;

export const DEFAULT_PROJECT_TAB = "knowledge";

export function projectTabs(projectId: string) {
  return PROJECT_TABS.map((tab) => ({ label: tab.label, href: `/projects/${projectId}/${tab.segment}` }));
}
