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
