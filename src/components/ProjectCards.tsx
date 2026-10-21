import Link from "next/link";
import type { CSSProperties } from "react";
import { Badge } from "@/components/ui/Badge";
import { getProjectStatus, packageSummary, publishingTargetLabel, type ProjectStatus } from "@/config/packages";
import type { ProjectWithClient } from "@/lib/projects";
import { siteHost } from "@/lib/validation";

export function ProjectStatusBadge({ status }: { status: ProjectStatus }) {
  const item = getProjectStatus(status);
  return <Badge tone={item.tone}>{item.label}</Badge>;
}

export const projectHref = (project: { id: string }) => `/projects/${project.id}`;

// Home gallery: a plain cover in the shape of a browser window. Live screenshots replace it in Phase 2.
export function ProjectTile({ project, index = 0 }: { project: ProjectWithClient; index?: number }) {
  return (
    <Link href={projectHref(project)} className="bfm-card bfm-card-interactive bfm-reveal app-project-tile" style={{ "--i": index } as CSSProperties}>
      <div className="app-cover" aria-hidden="true">
        <div className="app-cover-bar">
          <span className="app-cover-dot" />
          <span className="app-cover-dot" />
          <span className="app-cover-dot" />
          <span className="small app-cover-host">{siteHost(project.siteUrl)}</span>
        </div>
        <div className="app-cover-body small">{project.name}</div>
      </div>
      <div className="app-project-tile-body">
        <div className="app-card-head">
          <div>
            <p className="bfm-card-title">{project.name}</p>
            <p className="bfm-card-meta">
              {project.clientName} · {publishingTargetLabel(project.publishingTarget)}
            </p>
          </div>
          <ProjectStatusBadge status={project.status} />
        </div>
        <div className="app-badges">
          <Badge>{packageSummary(project.package)}</Badge>
        </div>
      </div>
    </Link>
  );
}

// Projects page: the project's facts in two columns.
export function ProjectSummaryCard({ project, index = 0 }: { project: ProjectWithClient; index?: number }) {
  return (
    <Link href={projectHref(project)} className="bfm-card bfm-card-interactive bfm-reveal app-card-link" style={{ "--i": index } as CSSProperties}>
      <div className="app-card-head">
        <div>
          <p className="bfm-card-title">{project.name}</p>
          <p className="bfm-card-meta">{siteHost(project.siteUrl)}</p>
        </div>
        <ProjectStatusBadge status={project.status} />
      </div>
      <dl className="app-facts small">
        <dt>Package</dt>
        <dd>{packageSummary(project.package)}</dd>
        <dt>Publishes to</dt>
        <dd>{publishingTargetLabel(project.publishingTarget)}</dd>
      </dl>
    </Link>
  );
}

// Client page: compact card with the package badge.
export function ClientProjectCard({ project }: { project: ProjectWithClient }) {
  return (
    <Link href={projectHref(project)} className="bfm-card bfm-card-interactive app-card-link">
      <div className="app-card-head">
        <div>
          <p className="bfm-card-title">{project.name}</p>
          <p className="bfm-card-meta">
            {siteHost(project.siteUrl)} · {publishingTargetLabel(project.publishingTarget)}
          </p>
        </div>
        <ProjectStatusBadge status={project.status} />
      </div>
      <div className="app-badges">
        <Badge tone="brand">{packageSummary(project.package)}</Badge>
      </div>
    </Link>
  );
}
