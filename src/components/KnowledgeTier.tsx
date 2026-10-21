import Link from "next/link";
import { saveKnowledgeAction } from "@/app/(app)/_actions/knowledge";
import { KnowledgeEditor } from "@/components/KnowledgeEditor";
import { KNOWLEDGE_TIERS } from "@/config/knowledge";
import { formatDateTime } from "@/lib/format";
import { emptySections, getCurrentKnowledge, getKnowledgeVersion, listKnowledgeVersions, type KnowledgeScope } from "@/lib/knowledge";

// Server side of a knowledge tier: the editor on the current version, or a read-only old version when the
// page is opened with ?version=N, plus the list of every saved version.
export async function KnowledgeTier({ scope, basePath, version }: { scope: KnowledgeScope; basePath: string; version?: string }) {
  const tier = KNOWLEDGE_TIERS[scope.tier];
  const [current, versions] = await Promise.all([getCurrentKnowledge(scope), listKnowledgeVersions(scope)]);
  const requested = version ? Number(version) : null;
  const viewing = requested && requested !== current?.version ? await getKnowledgeVersion(scope, requested) : null;

  return (
    <div className="app-stack">
      {requested && !viewing && requested !== current?.version ? (
        <p className="small app-banner" role="status">
          <span>There is no version {version}.</span>
          <Link href={basePath}>Back to the current version</Link>
        </p>
      ) : null}
      {viewing ? (
        <>
          <p className="small app-banner" role="status">
            <span>
              Viewing version {viewing.version} of {current?.version}, saved {formatDateTime(viewing.createdAt)}. Read only.
            </span>
            <Link href={basePath}>Back to the current version</Link>
          </p>
          <div className="bfm-card app-stack">
            {tier.sections.map((section) => (
              <div key={section.key} className="app-stack">
                <h3 className="heading" style={{ margin: 0 }}>
                  {section.label}
                </h3>
                <pre className="body app-knowledge-readonly">{viewing.sections[section.key] || "Empty"}</pre>
              </div>
            ))}
          </div>
        </>
      ) : (
        <KnowledgeEditor
          label={tier.label}
          sections={tier.sections}
          saved={current?.sections ?? emptySections(scope.tier)}
          savedLine={current ? `Version ${current.version}, saved ${formatDateTime(current.createdAt)}` : null}
          action={saveKnowledgeAction.bind(null, scope)}
        />
      )}
      {versions.length > 0 ? (
        <details className="app-versions small">
          <summary>View versions ({versions.length})</summary>
          <ol reversed>
            {versions.map((item) => (
              <li key={item.id}>
                <Link href={item.version === current?.version ? basePath : `${basePath}?version=${item.version}`}>
                  Version {item.version}
                </Link>
                , saved {formatDateTime(item.createdAt)}
                {item.version === current?.version ? " (current)" : ""}
              </li>
            ))}
          </ol>
        </details>
      ) : null}
    </div>
  );
}
