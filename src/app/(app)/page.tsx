import type { Metadata } from "next";
import Link from "next/link";
import { Suspense, type CSSProperties } from "react";
import { ProjectTile } from "@/components/ProjectCards";
import { Badge } from "@/components/ui/Badge";
import { CalendarAgenda, CalendarGrid, CalendarLegend } from "@/components/CalendarParts";
import { ButtonLink } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { LoadingCard } from "@/components/ui/LoadingCard";
import { PageHeader } from "@/components/ui/PageHeader";
import { listClients } from "@/lib/clients";
import { listProjects } from "@/lib/projects";
import { addDays, londonToday, monthOf } from "@/lib/dates";
import { listSlotsBetween, nextSlots, type SlotView } from "@/lib/posts";
import { requireUser } from "@/lib/session";
import { ensureSlots } from "@/lib/slots";

export const metadata: Metadata = { title: "Home" };

export default function HomePage() {
  return (
    <>
      <PageHeader eyebrow="BrandFactory Marketing" title="Home" />
      <Suspense fallback={<LoadingCard minHeight={240} />}>
        <HomeContent />
      </Suspense>
      <Suspense fallback={<LoadingCard minHeight={240} />}>
        <NextTwoWeeks />
      </Suspense>
    </>
  );
}

async function HomeContent() {
  await requireUser();
  // The tiles' next slot must see today's top-up, which the two-week section also runs (idempotent).
  await ensureSlots();
  const [projects, clients, next] = await Promise.all([listProjects(), listClients(), nextSlots()]);
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
            <ProjectTile key={project.id} project={project} next={next.get(project.id)} index={index} />
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

// The prototype's two-week calendar from today, reading the same slots as the calendar page.
async function NextTwoWeeks() {
  await requireUser();
  const today = londonToday();
  await ensureSlots({ today });
  const days = Array.from({ length: 14 }, (_, index) => addDays(today, index));
  const [slots, projects] = await Promise.all([listSlotsBetween(days[0], days[13]), listProjects()]);
  const showProject = projects.length > 1;
  const hrefFor = (slot: SlotView) => `/calendar?month=${monthOf(slot.slotDate)}&slot=${slot.id}`;
  return (
    <Card className="app-section" aria-labelledby="next-two-weeks">
      <div className="app-section-header">
        <div>
          <h2 id="next-two-weeks" className="heading app-section-title">
            Next two weeks
          </h2>
          <p className="small app-section-text">All projects. Dashed slots are planned but have no topic yet.</p>
        </div>
        <ButtonLink variant="secondary" size="sm" href="/calendar">
          Open calendar
        </ButtonLink>
      </div>
      <CalendarLegend slots={slots} today={today} />
      <div className="app-cal-wide app-cal-home app-cal-bordered">
        <CalendarGrid weeks={[days.slice(0, 7), days.slice(7)]} slots={slots} today={today} hrefFor={hrefFor} showProject={showProject} label="name" />
      </div>
      <div className="app-cal-narrow">
        <CalendarAgenda
          slots={slots}
          today={today}
          hrefFor={hrefFor}
          showProject={showProject}
          empty={projects.length === 0 ? "No projects yet. Active projects get planned slots here." : "Nothing planned in the next two weeks."}
        />
      </div>
    </Card>
  );
}
