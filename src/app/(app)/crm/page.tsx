import type { Metadata } from "next";
import Link from "next/link";
import { Suspense, type CSSProperties } from "react";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { LoadingCard } from "@/components/ui/LoadingCard";
import { EmptyState } from "@/components/ui/EmptyState";
import { CLIENT_STATUSES } from "@/config/packages";
import { RUN_PRESETS, WEEKDAY_NAMES } from "@/config/run-presets";
import { runSummary } from "@/components/ProjectCards";
import { listProjects, type ProjectWithClient } from "@/lib/projects";
import { listClients, type ClientListItem } from "@/lib/clients";
import { requireUser } from "@/lib/session";
import { CrmHeader } from "./AddClient";

export const metadata: Metadata = { title: "CRM" };

export default function CrmPage() {
  return (
    <>
      <CrmHeader />
      <Suspense fallback={<LoadingCard minHeight={240} />}>
        <CrmContent />
      </Suspense>
    </>
  );
}

async function CrmContent() {
  await requireUser();
  const [clients, projects] = await Promise.all([listClients(), listProjects()]);
  const runs = new Map(projects.map((project) => [project.id, project.currentRun]));
  return (
    <>
      <Presets projects={projects} />
      {clients.length === 0 ? (
        <EmptyState title="No clients yet" text="Add a client to start. Its projects and their runs will show here." />
      ) : (
        <ClientsTable clients={clients} runs={runs} />
      )}
    </>
  );
}

// Entry, Mid and Premium are run presets now (Phase 2 A1): each prefills a run's cadence, and the run keeps its own.
function Presets({ projects }: { projects: ProjectWithClient[] }) {
  return (
    <section className="app-section" aria-labelledby="presets-heading">
      <div className="app-section-header">
        <h2 id="presets-heading" className="heading app-section-title">
          Run presets
        </h2>
        <span className="small app-muted">Each prefills a run; set up runs on a project&apos;s Run plan tab</span>
      </div>
      <div className="app-card-grid">
        {RUN_PRESETS.map((item, index) => {
          const using = projects.filter((project) => project.currentRun?.preset === item.key);
          return (
            <div key={item.key} className="bfm-card bfm-reveal app-package-card" style={{ "--i": index } as CSSProperties}>
              <p className="bfm-card-title">{item.label}</p>
              <p className="display app-package-count">{item.seoWeekdays.length}</p>
              <p className="small app-muted">
                SEO {item.seoWeekdays.length === 1 ? "post" : "posts"} a week on {new Intl.ListFormat("en-GB", { type: "conjunction" }).format(item.seoWeekdays.map((day) => WEEKDAY_NAMES[day]))}, each with GBP,
                LinkedIn, Facebook and Pinterest posts the day after.
              </p>
              <p className="small">
                {using.length === 0
                  ? "No current runs"
                  : `${using.length} current ${using.length === 1 ? "run" : "runs"}: ${using.map((project) => project.name).join(", ")}`}
              </p>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function ClientsTable({ clients, runs }: { clients: ClientListItem[]; runs: Map<string, ProjectWithClient["currentRun"]> }) {
  return (
    <Card className="app-section" aria-labelledby="clients-heading">
      <h2 id="clients-heading" className="heading app-section-title">
        Clients
      </h2>
      <div className="app-table-wrap">
        <table className="body app-table">
          <thead>
            <tr>
              <th className="label">Client</th>
              <th className="label">Projects and runs</th>
              <th className="label">This month</th>
              <th className="label">Status</th>
            </tr>
          </thead>
          <tbody>
            {clients.map((client) => {
              const status = CLIENT_STATUSES[client.status];
              return (
                <tr key={client.id}>
                  <td data-label="Client">
                    <Link href={`/crm/${client.id}`} className="app-table-name">
                      {client.name}
                    </Link>
                  </td>
                  <td data-label="Projects and runs">
                    {client.projects.length === 0
                      ? "No projects yet"
                      : client.projects.map((project) => `${project.name}: ${runSummary(runs.get(project.id) ?? null)}`).join(", ")}
                  </td>
                  <td data-label="This month">
                    <span className="small app-muted">No posts scheduled</span>
                  </td>
                  <td data-label="Status">
                    <Badge tone={status.tone}>{status.label}</Badge>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
