import Link from "next/link";
import type { CSSProperties } from "react";
import { Badge } from "@/components/ui/Badge";
import { getProjectStatus, packageSummary, publishingTargetLabel, type ProjectStatus } from "@/config/packages";
import { shortDate } from "@/lib/dates";
import type { NextSlot } from "@/lib/posts";
import type { ProjectWithClient } from "@/lib/projects";
import { siteHost } from "@/lib/validation";

export function ProjectStatusBadge({ status }: { status: ProjectStatus }) {
  const item = getProjectStatus(status);
  return <Badge tone={item.tone}>{item.label}</Badge>;
}

export const projectHref = (project: { id: string }) => `/projects/${project.id}`;

// The "Next in run plan" line (γ3 orientation Q11): the first slot from today on.
export function nextInRunPlan(project: Pick<ProjectWithClient, "status">, next: NextSlot | undefined): string {
  if (next) return `${shortDate(next.slotDate)} · ${next.topic ?? "No topic yet"}`;
  return project.status === "paused" ? "Paused, no slots planned" : "No slots planned";
}

// Home gallery: a plain cover in the shape of a browser window. Live screenshots replace it in Phase 2.
export function ProjectTile({ project, next, index = 0 }: { project: ProjectWithClient; next?: NextSlot; index?: number }) {
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
          {next ? <Badge tone="brand">Next post {shortDate(next.slotDate)}</Badge> : null}
          {!next && project.status === "paused" ? <Badge>Paused, no slots planned</Badge> : null}
          <Badge>{packageSummary(project.package)}</Badge>
        </div>
      </div>
    </Link>
  );
}

// Projects page: the project's facts in two columns.
export function ProjectSummaryCard({ project, next, index = 0 }: { project: ProjectWithClient; next?: NextSlot; index?: number }) {
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
        <dt>Next in run plan</dt>
        <dd>{nextInRunPlan(project, next)}</dd>
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
