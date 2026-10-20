import type { ReactNode } from "react";

export function PageHeader({ eyebrow, title, actions }: { eyebrow: string; title: string; actions?: ReactNode }) {
  return (
    <div className="app-page-header">
      <div>
        <p className="small app-page-eyebrow">{eyebrow}</p>
        <h1 className="title app-page-title">{title}</h1>
      </div>
      {actions}
    </div>
  );
}
