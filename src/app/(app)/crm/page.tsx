import type { Metadata } from "next";
import Link from "next/link";
import { Suspense, type CSSProperties } from "react";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { LoadingCard } from "@/components/ui/LoadingCard";
import { EmptyState } from "@/components/ui/EmptyState";
import { CLIENT_STATUSES, PACKAGES, getPackage } from "@/config/packages";
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
  const clients = await listClients();
  return (
    <>
      <Packages clients={clients} />
      {clients.length === 0 ? (
        <EmptyState title="No clients yet" text="Add a client to start. Its projects and their packages will show here." />
      ) : (
        <ClientsTable clients={clients} />
      )}
    </>
  );
}

function Packages({ clients }: { clients: ClientListItem[] }) {
  const projects = clients.flatMap((client) => client.projects);
  return (
    <section className="app-section" aria-labelledby="packages-heading">
      <div className="app-section-header">
        <h2 id="packages-heading" className="heading app-section-title">
          Marketing packages
        </h2>
        <span className="small app-muted">Chosen per project in its settings</span>
      </div>
      <div className="app-card-grid">
        {PACKAGES.map((item, index) => {
          const using = projects.filter((project) => project.package === item.key);
          return (
            <div key={item.key} className="bfm-card bfm-reveal app-package-card" style={{ "--i": index } as CSSProperties}>
              <p className="bfm-card-title">{item.label}</p>
              <p className="display app-package-count">{item.postsPerWeek}</p>
              <p className="small app-muted">
                SEO {item.postsPerWeek === 1 ? "post" : "posts"} a week, each with GMB and LinkedIn derivatives. Active projects get planned
                slots at this cadence.
              </p>
              <p className="small">
                {using.length === 0
                  ? "No projects"
                  : `${using.length} ${using.length === 1 ? "project" : "projects"}: ${using.map((project) => project.name).join(", ")}`}
              </p>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function ClientsTable({ clients }: { clients: ClientListItem[] }) {
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
              <th className="label">Projects and packages</th>
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
                  <td data-label="Projects and packages">
                    {client.projects.length === 0
                      ? "No projects yet"
                      : client.projects.map((project) => `${project.name}: ${getPackage(project.package).label}`).join(", ")}
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
