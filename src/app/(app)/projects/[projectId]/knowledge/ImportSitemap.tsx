"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/Button";
import type { SitemapImportState } from "./sitemap-actions";

function summary(state: Extract<SitemapImportState, { status: "imported" }>) {
  const pages = `Imported ${state.pages} ${state.pages === 1 ? "page" : "pages"}.`;
  if (state.titlesFromPath === 0) return `${pages} Every title was read from its page.`;
  const reason = state.budgetRanOut ? "because the import ran short of time" : "because their pages did not answer or had no title";
  return `${pages} ${state.titlesFetched} titles read from the pages; ${state.titlesFromPath} use their path ${reason}.`;
}

export function ImportSitemap({ imported, action }: { imported: boolean; action: (state: SitemapImportState) => Promise<SitemapImportState> }) {
  const [state, formAction, pending] = useActionState(action, { status: "idle" });
  return (
    <form action={formAction} className="app-stack">
      <div className="app-form-actions" style={{ justifyContent: "flex-start" }}>
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Importing" : imported ? "Import again" : "Import sitemap"}
        </Button>
        {pending ? (
          <span className="small app-muted" role="status">
            Reading the sitemap and each page&apos;s title. This can take up to a minute.
          </span>
        ) : null}
      </div>
      {!pending && state.status === "imported" ? (
        <p className="small app-saved" role="status" style={{ margin: 0 }}>
          {summary(state)}
        </p>
      ) : null}
      {!pending && state.status === "error" ? (
        <p className="small app-form-error" role="alert">
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
