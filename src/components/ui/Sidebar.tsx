"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Fragment, useState, type ReactNode } from "react";
import { BrandMark, Icon } from "./Icon";
import { isCurrent, type NavItem } from "@/lib/nav";

type SidebarProps = {
  items: NavItem[];
  sections?: { label: string; items: NavItem[] }[];
  footer?: ReactNode;
};

export function Sidebar({ items, sections = [], footer }: SidebarProps) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const renderItem = (item: NavItem) => (
    <Link
      key={item.href}
      href={item.href}
      className="bfm-nav-item"
      aria-current={isCurrent(item.href, pathname) ? "page" : undefined}
      onClick={() => setOpen(false)}
    >
      <Icon name={item.icon} />
      {item.label}
    </Link>
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
