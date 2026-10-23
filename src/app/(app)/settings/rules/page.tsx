import type { Metadata } from "next";
import { Suspense } from "react";
import { KnowledgeTier } from "@/components/KnowledgeTier";
import { Badge } from "@/components/ui/Badge";
import { LoadingCard } from "@/components/ui/LoadingCard";
import { KNOWLEDGE_TIERS, type KnowledgeTier as Tier } from "@/config/knowledge";
import { CANDIDATE_SECTIONS } from "@/prompts/rules";
import { listCandidates, targetLabel, type CandidateView } from "@/lib/rules";
import { requireUser } from "@/lib/session";
import { acceptCandidateAction, dismissCandidateAction } from "./actions";
import { CandidateCard } from "./CandidateCard";

export const metadata: Metadata = { title: "BrandFactory rules" };

export default function RulesPage({ searchParams }: PageProps<"/settings/rules">) {
  return (
    <section className="app-section" aria-label="BrandFactory rules">
      <p className="small app-muted" style={{ margin: 0 }}>
        The writer and critic apply these to every post for every client. Client knowledge (in the CRM) and project knowledge (on each
        project) add to them; they never override them.
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

// Rule candidates from Amir's edits (decision 17, γ5 orientation Q5), as the prototype places them.
async function Candidates() {
  await requireUser();
  const { proposed, decided } = await listCandidates();
  const targetsFor = (candidate: CandidateView) =>
    (Object.keys(CANDIDATE_SECTIONS) as Tier[]).flatMap((tier) =>
      CANDIDATE_SECTIONS[tier].map((section) => ({
        value: `${tier}:${section}`,
        label: `${tier === "client" ? `${KNOWLEDGE_TIERS.client.label} (${candidate.clientName})` : tier === "project" ? `${KNOWLEDGE_TIERS.project.label} (${candidate.projectName})` : KNOWLEDGE_TIERS.agency.label}: ${targetLabel(tier, section).split(": ")[1]}`,
      })),
    );
  return (
    <section className="bfm-aurora app-stack app-candidates" aria-labelledby="candidates-heading">
      <div className="app-card-head">
        <h2 id="candidates-heading" className="heading" style={{ margin: 0 }}>
          Rule candidates from your edits
        </h2>
        <span className="small app-muted">Choose where each rule belongs</span>
      </div>
      {proposed.length === 0 ? (
        <p className="small app-muted" style={{ margin: 0 }}>
          None waiting. When you approve a post you edited, Claude proposes rules from your edits here, and facts from your regenerate notes.
        </p>
      ) : (
        proposed.map((candidate) => (
          <CandidateCard
            key={candidate.id}
            kind={candidate.kind}
            text={candidate.text}
            from={candidate.kind === "fact" ? `From your note on "${candidate.postTitle}"` : `From your edit to "${candidate.postTitle}"`}
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
                {candidate.status === "accepted" ? `Added to ${targetLabel(candidate.tier, candidate.section)}` : "Dismissed"}
              </Badge>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
