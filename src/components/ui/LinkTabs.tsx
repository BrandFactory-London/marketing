"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense } from "react";
import { isCurrent } from "@/lib/nav";

// A badge is a short count beside the label, such as "3 new from the client" (Phase 2 A3).
export type LinkTab = { label: string; href: string; badge?: string | null };

function Tab({ tab, current }: { tab: LinkTab; current: boolean }) {
  return (
    <Link href={tab.href} className="app-tab" aria-current={current ? "page" : undefined}>
      {tab.label}
      {tab.badge ? <span className="bfm-badge bfm-badge-warning app-tab-badge">{tab.badge}</span> : null}
    </Link>
  );
}

function CurrentAwareTab({ tab }: { tab: LinkTab }) {
  return <Tab tab={tab} current={isCurrent(tab.href, usePathname())} />;
}

// A row of tabs that are links, one route per tab. As in the Sidebar, only the current-tab mark waits for
// the path, so routes with a dynamic segment still prerender the row.
export function LinkTabs({ label, tabs }: { label: string; tabs: readonly LinkTab[] }) {
  return (
    <nav className="app-tabs" aria-label={label}>
      {tabs.map((tab) => (
        <Suspense key={tab.href} fallback={<Tab tab={tab} current={false} />}>
          <CurrentAwareTab tab={tab} />
        </Suspense>
      ))}
    </nav>
  );
}
