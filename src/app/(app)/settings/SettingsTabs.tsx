"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { isCurrent, settingsNav } from "@/lib/nav";

export function SettingsTabs() {
  const pathname = usePathname();
  return (
    <nav className="app-tabs" aria-label="Settings sections">
      {settingsNav.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className="app-tab"
          aria-current={isCurrent(item.href, pathname) ? "page" : undefined}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
