import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Badge } from "@/components/ui/Badge";
import { Card, CardMeta, CardTitle } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { listFolderFiles, type DriveFile } from "@/lib/drive";
import { GoogleReconnectRequired, getGoogleAccessToken } from "@/lib/google-tokens";
import { requireUser } from "@/lib/session";

// Discovery proof for γ1: Drive scope and token refresh. Not linked from the nav. Hidden (404) unless
// DRIVE_PROOF_FOLDER_ID is set. To be removed before Phase 1 ends (docs/backlog.md item 3).

export const metadata: Metadata = { title: "Drive check" };

export default function DriveCheckPage() {
  return (
    <>
      <PageHeader eyebrow="Discovery check, not part of the product." title="Drive check" />
      <Suspense fallback={<Card aria-busy="true"><CardMeta>Checking Drive</CardMeta></Card>}>
        <DriveCheck />
      </Suspense>
    </>
  );
}

const time = new Intl.DateTimeFormat("en-GB", { timeStyle: "medium", timeZone: "Europe/London" });

async function DriveCheck() {
  const user = await requireUser();
  const folderId = process.env.DRIVE_PROOF_FOLDER_ID;
  if (!folderId) notFound();

  let refreshedAt: Date | null = null;
  let files: DriveFile[];
  try {
    // Force the refresh-token exchange on every load, so the page proves refreshing works.
    const token = await getGoogleAccessToken(user.id, { forceRefresh: true });
    refreshedAt = token.refreshedAt;
    files = await listFolderFiles(token.accessToken, folderId);
  } catch (error) {
    const message =
      error instanceof GoogleReconnectRequired
        ? `${error.message} Use Sign out, then sign in with Google again.`
        : error instanceof Error
          ? error.message
          : "The Drive check failed.";
    return (
      <Card>
        <CardTitle>Drive check failed</CardTitle>
        <p className="body" role="alert" style={{ color: "var(--danger)", margin: "var(--space-2) 0 0" }}>
          {message}
        </p>
      </Card>
    );
  }

  return (
    <Card>
      <div className="app-page-header">
        <CardTitle>Folder contents</CardTitle>
        <Badge tone="success">Connected</Badge>
      </div>
      <CardMeta>Access token refreshed at {refreshedAt ? time.format(refreshedAt) : "unknown"}</CardMeta>
      {files.length === 0 ? (
        <p className="body">The folder is empty.</p>
      ) : (
        <ul className="body" style={{ margin: "var(--space-4) 0 0", paddingLeft: "var(--space-6)" }}>
          {files.map((file) => (
            <li key={file.id}>
              {file.name} <span className="small" style={{ color: "var(--ink-muted)" }}>{file.mimeType}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
