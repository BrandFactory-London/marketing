import type { Metadata } from "next";
import { Suspense } from "react";
import { reconnectGoogleAction } from "@/app/actions";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { describeScope, getGoogleConnection } from "@/lib/connections";
import { formatDateTime } from "@/lib/format";
import { requireUser } from "@/lib/session";
import { AnthropicCheck } from "./AnthropicCheck";

export const metadata: Metadata = { title: "Connections" };

export default function ConnectionsPage() {
  return (
    <Card className="app-section" aria-labelledby="connections-heading">
      <h2 id="connections-heading" className="heading app-section-title">
        Connections
      </h2>
      <ul className="app-connections">
        <Suspense
          fallback={
            <li className="app-connection" aria-busy="true">
              <span className="subheading">Google</span>
            </li>
          }
        >
          <GoogleRow />
        </Suspense>
        <li className="app-connection">
          <AnthropicCheck />
        </li>
        <li className="app-connection">
          <span>
            <span className="subheading">Trigger.dev</span>
            <br />
            <span className="small app-muted">{triggerLine()}</span>
          </span>
          <Badge tone={triggerEnvironment() ? "success" : "warning"}>{triggerEnvironment() ? "Configured" : "Not configured"}</Badge>
        </li>
        <li className="app-connection">
          <span>
            <span className="subheading">Wix</span>
            <br />
            <span className="small app-muted">Blog publishing credentials are added for each project before publishing is switched on.</span>
          </span>
          <Badge>Not connected yet</Badge>
        </li>
      </ul>
    </Card>
  );
}

async function GoogleRow() {
  const user = await requireUser();
  const connection = await getGoogleConnection(user.id);
  return (
    <li className="app-connection">
      <span>
        <span className="subheading">Google</span>
        <br />
        {connection ? (
          <span className="small app-muted">
            Connected as {connection.email}. Access: {connection.scopes.map(describeScope).filter((name, i, all) => all.indexOf(name) === i).join(", ")}.
            Last refreshed {formatDateTime(connection.lastRefresh)}.
          </span>
        ) : (
          <span className="small app-muted">No Google connection is stored. Drive folders cannot be checked until you reconnect.</span>
        )}
      </span>
      <span className="app-row">
        <Badge tone={connection ? "success" : "warning"}>{connection ? "Connected" : "Not connected"}</Badge>
        <form action={reconnectGoogleAction}>
          <Button type="submit" variant="secondary" size="sm">
            Reconnect Google
          </Button>
        </form>
      </span>
    </li>
  );
}

// Which Trigger.dev environment the app starts runs in, read from the secret key's prefix. Never the key itself.
function triggerEnvironment(): string | null {
  const key = process.env.TRIGGER_SECRET_KEY ?? "";
  if (key.startsWith("tr_prod_")) return "Production";
  if (key.startsWith("tr_dev_")) return "Development";
  if (key.startsWith("tr_")) return "a Trigger.dev environment";
  return null;
}

function triggerLine(): string {
  const environment = triggerEnvironment();
  return environment
    ? `Specs and posts are written by tasks in ${environment}. Each run's steps are listed in the Trigger.dev dashboard.`
    : "No Trigger.dev secret key is set, so nothing can be generated. Add TRIGGER_SECRET_KEY in Vercel.";
}
