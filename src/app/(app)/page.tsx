import type { Metadata } from "next";
import Link from "next/link";
import { Suspense, type CSSProperties } from "react";
import { ProjectTile } from "@/components/ProjectCards";
import { Badge } from "@/components/ui/Badge";
import { ButtonLink } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { listClients } from "@/lib/clients";
import { listProjects } from "@/lib/projects";
import { requireUser } from "@/lib/session";

export const metadata: Metadata = { title: "Home" };

export default function HomePage() {
  return (
    <>
      <PageHeader eyebrow="BrandFactory Marketing" title="Home" />
      <Suspense fallback={<Card aria-busy="true" className="bfm-skeleton" style={{ minHeight: 240 }} />}>
        <HomeContent />
      </Suspense>
      <Card className="app-section" aria-labelledby="next-two-weeks">
        <div className="app-section-header">
          <div>
            <h2 id="next-two-weeks" className="heading app-section-title">
              Next two weeks
            </h2>
            <p className="small app-section-text">All projects. Planned slots arrive with the calendar.</p>
          </div>
          <ButtonLink variant="secondary" size="sm" href="/calendar">
            Open calendar
          </ButtonLink>
        </div>
        <p className="body app-muted" style={{ margin: 0 }}>
          No posts planned yet. Active projects will get planned slots here at their package&apos;s cadence.
        </p>
      </Card>
    </>
  );
}

async function HomeContent() {
  await requireUser();
  const [projects, clients] = await Promise.all([listProjects(), listClients()]);
  const active = projects.filter((project) => project.status === "active").length;

  return (
    <>
      <section className="app-section" aria-labelledby="home-projects">
        <div className="app-section-header">
          <h2 id="home-projects" className="heading app-section-title">
            Projects
          </h2>
          <Link className="small" href="/projects">
            All projects
          </Link>
        </div>
        <div className="app-card-grid">
          {projects.map((project, index) => (
            <ProjectTile key={project.id} project={project} index={index} />
          ))}
          <Link href="/projects?add=1" className="bfm-reveal app-add-tile" style={{ "--i": projects.length } as CSSProperties}>
            Add project
          </Link>
        </div>
      </section>

      <div className="app-card-grid">
        <Link href="/crm" className="bfm-card bfm-card-interactive bfm-reveal app-card-link">
          <div className="app-card-head">
            <p className="bfm-card-title">Clients</p>
            <Badge>
              {active} active {active === 1 ? "project" : "projects"}
            </Badge>
          </div>
          <p className="display app-stat">{clients.length}</p>
          <p className="bfm-card-meta">{clients.length === 0 ? "No clients yet" : clients.map((client) => client.name).join(", ")}</p>
        </Link>
      </div>
    </>
  );
}
