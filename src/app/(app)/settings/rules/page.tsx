import type { Metadata } from "next";
import { Suspense } from "react";
import { KnowledgeTier } from "@/components/KnowledgeTier";
import { Badge } from "@/components/ui/Badge";
import { LoadingCard } from "@/components/ui/LoadingCard";
import { CHANNELS, hasChannelSections, KNOWLEDGE_TIERS, RULE_SCOPES, scopeLabel, type KnowledgeTier as Tier } from "@/config/knowledge";
import { CANDIDATE_SECTIONS } from "@/prompts/learn";
import { listCandidates, targetLabel, type CandidateView } from "@/lib/rules";
import { requireUser } from "@/lib/session";
import { acceptCandidateAction, dismissCandidateAction } from "./actions";
import { CandidateCard } from "./CandidateCard";

export const metadata: Metadata = { title: "BrandFactory rules" };

export default function RulesPage({ searchParams }: PageProps<"/settings/rules">) {
  return (
    <section className="app-section" aria-label="BrandFactory rules">
      <p className="small app-muted" style={{ margin: 0 }}>
        The writer and critic apply these to every post for every client. Writing rules and banned phrases apply on every channel; the
        sections under By channel apply only to that channel. Client knowledge (in the CRM) and project knowledge (on each project) add
        to them; they never override them.
      </p>
      <Suspense fallback={<LoadingCard minHeight={320} />}>
        <Rules searchParams={searchParams} />
      </Suspense>
      <Suspense fallback={<LoadingCard minHeight={160} />}>
        <Candidates />
      </Suspense>
    </section>
  );
}

async function Rules({ searchParams }: Pick<PageProps<"/settings/rules">, "searchParams">) {
  await requireUser();
  const { version } = await searchParams;
  return <KnowledgeTier scope={{ tier: "agency" }} basePath="/settings/rules" version={typeof version === "string" ? version : undefined} />;
}

// Rule and fact candidates from Amir's notes and edits on every channel (decision 17, γ5 orientation Q5, γ7 handoff
// items 5 and 9), as the prototype places them.
async function Candidates() {
  await requireUser();
  const { proposed, decided } = await listCandidates();
  const targetsFor = (candidate: CandidateView) =>
    (Object.keys(CANDIDATE_SECTIONS) as Tier[]).flatMap((tier) =>
      CANDIDATE_SECTIONS[tier].map((section) => ({
        value: `${tier}:${section}`,
        label: `${tier === "client" ? `${KNOWLEDGE_TIERS.client.label} (${candidate.clientName})` : tier === "project" ? `${KNOWLEDGE_TIERS.project.label} (${candidate.projectName})` : KNOWLEDGE_TIERS.agency.label}: ${targetLabel(tier, section).split(": ")[1]}`,
        scoped: hasChannelSections(tier, section),
      })),
    );
  const scopes = RULE_SCOPES.map((scope) => ({ value: scope, label: scopeLabel(scope) }));
  return (
    <section className="bfm-aurora app-stack app-candidates" aria-labelledby="candidates-heading">
      <div className="app-card-head">
        <h2 id="candidates-heading" className="heading" style={{ margin: 0 }}>
          Suggestions from your notes and edits
        </h2>
        <span className="small app-muted">Choose where each one belongs</span>
      </div>
      {proposed.length === 0 ? (
        <p className="small app-muted" style={{ margin: 0 }}>
          None waiting. When you regenerate or reject a post with a note, approve a post you edited, or regenerate or edit and copy a derivative,
          Claude proposes any rule or fact in it here.
        </p>
      ) : (
        proposed.map((candidate) => (
          <CandidateCard
            key={candidate.id}
            kind={candidate.kind}
            text={candidate.text}
            from={candidate.from}
            channel={candidate.channel === "blog" ? null : CHANNELS[candidate.channel].label}
            scope={candidate.scope}
            scopes={scopes}
            before={candidate.before}
            after={candidate.after}
            reason={candidate.reason}
            target={`${candidate.tier}:${candidate.section}`}
            targets={targetsFor(candidate)}
            acceptAction={acceptCandidateAction.bind(null, candidate.id)}
            dismissAction={dismissCandidateAction.bind(null, candidate.id)}
          />
        ))
      )}
      {decided.length > 0 ? (
        <ul className="app-plain-list small">
          {decided.map((candidate) => (
            <li key={candidate.id} className="app-card-head">
              <span>{candidate.text}</span>
              <Badge tone={candidate.status === "accepted" ? "success" : "neutral"}>
                {candidate.status === "accepted" ? `Added to ${targetLabel(candidate.tier, candidate.section, candidate.scope)}` : "Dismissed"}
              </Badge>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
