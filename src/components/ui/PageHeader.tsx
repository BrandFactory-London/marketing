import Link from "next/link";
import type { ReactNode } from "react";

export function PageHeader({
  eyebrow,
  title,
  meta,
  actions,
}: {
  eyebrow: ReactNode;
  title: string;
  meta?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="app-page-header">
      <div>
        <p className="small app-page-eyebrow">{eyebrow}</p>
        <h1 className="title app-page-title">{title}</h1>
        {meta ? <p className="small app-page-meta">{meta}</p> : null}
      </div>
      {actions}
    </div>
  );
}

// "CRM / Migss Interiors": the parent links back, the current page is muted.
export function Breadcrumb({ items }: { items: { label: string; href?: string }[] }) {
  return (
    <>
      {items.map((item, index) => (
        <span key={`${item.label}-${index}`}>
          {index > 0 ? " " : null}
          {item.href ? <Link href={item.href}>{item.label}</Link> : <span className="app-muted">/ {item.label}</span>}
        </span>
      ))}
    </>
  );
}
