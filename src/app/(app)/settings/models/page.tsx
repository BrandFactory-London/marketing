import type { Metadata } from "next";
import { Suspense } from "react";
import { Card } from "@/components/ui/Card";
import { requireUser } from "@/lib/session";
import { getModelSettings } from "@/lib/settings";
import { ModelsForm } from "./ModelsForm";

export const metadata: Metadata = { title: "AI models" };

export default function ModelsPage() {
  return (
    <Suspense fallback={<Card aria-busy="true" className="bfm-skeleton" style={{ minHeight: 240 }} />}>
      <Models />
    </Suspense>
  );
}

async function Models() {
  await requireUser();
  return <ModelsForm current={await getModelSettings()} />;
}
