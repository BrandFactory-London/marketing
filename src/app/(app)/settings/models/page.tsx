import type { Metadata } from "next";
import { Suspense } from "react";
import { LoadingCard } from "@/components/ui/LoadingCard";
import { requireUser } from "@/lib/session";
import { getModelSettings } from "@/lib/settings";
import { ModelsForm } from "./ModelsForm";

export const metadata: Metadata = { title: "AI models" };

export default function ModelsPage() {
  return (
    <Suspense fallback={<LoadingCard minHeight={240} />}>
      <Models />
    </Suspense>
  );
}

async function Models() {
  await requireUser();
  return <ModelsForm current={await getModelSettings()} />;
}
