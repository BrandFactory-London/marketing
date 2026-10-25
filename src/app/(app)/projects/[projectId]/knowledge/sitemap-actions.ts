"use server";

import { refresh } from "next/cache";
import { getProject } from "@/lib/projects";
import { requireUser } from "@/lib/session";
import { importSitemap, SitemapError } from "@/lib/sitemap";

export type SitemapImportState =
  | { status: "idle" }
  | { status: "imported"; pages: number; titlesFetched: number; titlesFromPath: number; budgetRanOut: boolean }
  | { status: "error"; message: string };

// Called through useActionState, which passes the previous state; the import does not need it.
export async function importSitemapAction(projectId: string): Promise<SitemapImportState> {
  await requireUser();
  const project = await getProject(projectId);
  if (!project) return { status: "error", message: "This project no longer exists." };
  try {
    const result = await importSitemap(project);
    refresh();
    return {
      status: "imported",
      pages: result.pages.length,
      titlesFetched: result.titlesFetched,
      titlesFromPath: result.titlesFromPath,
      budgetRanOut: result.budgetRanOut,
    };
  } catch (error) {
    if (error instanceof SitemapError) return { status: "error", message: `${error.message} The previous page list is unchanged.` };
    console.error("Sitemap import failed:", error);
    return { status: "error", message: "The sitemap could not be imported. The previous page list is unchanged." };
  }
}
