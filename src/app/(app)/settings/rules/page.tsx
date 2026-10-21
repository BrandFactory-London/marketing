import type { Metadata } from "next";
import { Suspense } from "react";
import { KnowledgeTier } from "@/components/KnowledgeTier";
import { LoadingCard } from "@/components/ui/LoadingCard";
import { requireUser } from "@/lib/session";

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
    </section>
  );
}

async function Rules({ searchParams }: Pick<PageProps<"/settings/rules">, "searchParams">) {
  await requireUser();
  const { version } = await searchParams;
  return <KnowledgeTier scope={{ tier: "agency" }} basePath="/settings/rules" version={typeof version === "string" ? version : undefined} />;
}
