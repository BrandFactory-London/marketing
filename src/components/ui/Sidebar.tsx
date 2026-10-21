"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Fragment, Suspense, useState, type ReactNode } from "react";
import { BrandMark, Icon } from "./Icon";
import { isCurrent, type NavItem } from "@/lib/nav";

type SidebarProps = {
  items: NavItem[];
  sections?: { label: string; items: NavItem[] }[];
  footer?: ReactNode;
};

type ItemProps = { item: NavItem; onNavigate: () => void };

function NavLink({ item, onNavigate, current }: ItemProps & { current: boolean }) {
  return (
    <Link href={item.href} className="bfm-nav-item" aria-current={current ? "page" : undefined} onClick={onNavigate}>
      <Icon name={item.icon} />
      {item.label}
    </Link>
  );
}

function CurrentAwareNavLink(props: ItemProps) {
  return <NavLink {...props} current={isCurrent(props.item.href, usePathname())} />;
}

export function Sidebar({ items, sections = [], footer }: SidebarProps) {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);

  // On routes with a dynamic segment (/crm/[clientId]) the path is unknown at prerender, so only the
  // current-item mark waits for it; the link itself is prerendered as the fallback.
  const renderItem = (item: NavItem) => (
    <Suspense key={item.href} fallback={<NavLink item={item} onNavigate={close} current={false} />}>
      <CurrentAwareNavLink item={item} onNavigate={close} />
    </Suspense>
  );

  return (
    <>
      <div className="app-topbar">
        <Link href="/" className="app-brand">
          <BrandMark />
          BrandFactory Marketing
        </Link>
        <button
          type="button"
          className="bfm-btn bfm-btn-ghost bfm-btn-sm"
          aria-expanded={open}
          aria-controls="app-sidebar"
          aria-label={open ? "Close menu" : "Open menu"}
          onClick={() => setOpen((value) => !value)}
        >
          <Icon name={open ? "close" : "menu"} />
        </button>
      </div>
      <div id="app-sidebar" className="app-sidebar" data-open={open}>
        <nav className="bfm-nav" aria-label="Main">
          <div className="bfm-nav-brand app-brand">
            <BrandMark />
            BrandFactory Marketing
          </div>
          {items.map(renderItem)}
          {sections.map((section) => (
            <Fragment key={section.label}>
              <div className="bfm-nav-section">{section.label}</div>
              {section.items.map(renderItem)}
            </Fragment>
          ))}
          {footer}
        </nav>
      </div>
    </>
  );
}
