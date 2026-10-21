"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/Button";
import type { CoverFolderView } from "@/lib/covers";
import type { BrowseResult, ReviewActionResult } from "./actions";

type Props = {
  projectId: string;
  cover: { fileId: string; name: string; path: string | null } | null;
  hasFolder: boolean;
  locked: boolean;
  browseAction: (folderId: string | null, pageToken: string | null) => Promise<BrowseResult>;
  chooseAction: (fileId: string) => Promise<ReviewActionResult>;
};

const thumb = (projectId: string, fileId: string, size: 320 | 1200) => `/api/drive/thumbnail/${encodeURIComponent(fileId)}?project=${projectId}&size=${size}`;

// Pick a cover from the project's Drive folder, browsing into subfolders (decision 18, backlog 11). The photo is
// recorded on the post; γ6 uploads it to Wix.
export function CoverPicker({ projectId, cover, hasFolder, locked, browseAction, chooseAction }: Props) {
  const [view, setView] = useState<CoverFolderView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const open = (folderId: string | null, pageToken: string | null = null) =>
    startTransition(async () => {
      const result = await browseAction(folderId, pageToken);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setError(null);
      // "Show more photos" adds the next page to the folder already shown.
      setView((current) =>
        pageToken && current
          ? { ...result.view, folders: [...current.folders, ...result.view.folders], images: [...current.images, ...result.view.images] }
          : result.view,
      );
    });

  const choose = (fileId: string) =>
    startTransition(async () => {
      const result = await chooseAction(fileId);
      if (result.ok) setView(null);
      else setError(result.message);
    });

  return (
    <div className="app-stack">
      {cover ? (
        <figure className="app-cover" style={{ margin: 0 }}>
          {/* eslint-disable-next-line @next/next/no-img-element -- a private Drive thumbnail served by the app's own route */}
          <img src={thumb(projectId, cover.fileId, 1200)} alt={`Cover: ${cover.name}`} />
          <figcaption className="small app-muted">
            {cover.name}
            {cover.path ? ` · ${cover.path}` : ""}
          </figcaption>
        </figure>
      ) : (
        <p className="small app-muted" style={{ margin: 0 }}>
          No cover yet. You can approve without one; publishing will need one.
        </p>
      )}
      {!hasFolder ? (
        <p className="small app-muted" style={{ margin: 0 }}>
          Add the project&apos;s Drive folder in its Settings to choose a cover.
        </p>
      ) : !locked && !view ? (
        <div className="app-review-buttons">
          <Button variant="secondary" size="sm" disabled={pending} onClick={() => open(null)}>
            {cover ? "Change cover" : "Choose cover"}
          </Button>
        </div>
      ) : null}
      {view ? (
        <div className="app-stack" aria-label="Drive photos">
          <nav className="app-crumbs small" aria-label="Folder">
            {view.path.map((folder, index) => (
              <span key={folder.id} className="app-crumb">
                {index > 0 ? <span aria-hidden="true">/</span> : null}
                {index < view.path.length - 1 ? (
                  <button type="button" className="app-link-button" onClick={() => open(folder.id)}>
                    {folder.name}
                  </button>
                ) : (
                  <strong>{folder.name}</strong>
                )}
              </span>
            ))}
          </nav>
          {view.folders.length > 0 ? (
            <div className="app-review-buttons">
              {view.folders.map((folder) => (
                <Button key={folder.id} variant="secondary" size="sm" disabled={pending} onClick={() => open(folder.id)}>
                  {folder.name}
                </Button>
              ))}
            </div>
          ) : null}
          {view.images.length > 0 ? (
            <div className="app-cover-grid">
              {view.images.map((image) => (
                <button key={image.id} type="button" className="app-cover-tile" aria-label={image.name} disabled={pending} onClick={() => choose(image.id)} aria-pressed={cover?.fileId === image.id}>
                  {/* eslint-disable-next-line @next/next/no-img-element -- a private Drive thumbnail served by the app's own route */}
                  <img src={thumb(projectId, image.id, 320)} alt="" loading="lazy" />
                </button>
              ))}
            </div>
          ) : (
            <p className="small app-muted" style={{ margin: 0 }}>
              No photos in this folder{view.folders.length > 0 ? "; open a subfolder" : ""}.
            </p>
          )}
          <div className="app-review-buttons">
            {view.nextPageToken ? (
              <Button variant="secondary" size="sm" disabled={pending} onClick={() => open(view.path[view.path.length - 1].id, view.nextPageToken)}>
                Show more photos
              </Button>
            ) : null}
            <Button variant="ghost" size="sm" onClick={() => setView(null)}>
              Close
            </Button>
          </div>
        </div>
      ) : null}
      {error ? (
        <p className="small app-form-error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
