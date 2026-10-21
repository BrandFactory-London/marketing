"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/Button";
import { keepValuesOnSubmit } from "@/components/ui/keepValues";
import { Field } from "@/components/ui/Field";
import type { DriveFolderState } from "./actions";

type Props = {
  current: { id: string; name: string; checkedAt: string } | null;
  action: (state: DriveFolderState, formData: FormData) => Promise<DriveFolderState>;
  removeAction: () => Promise<void>;
};

function filesLine(found: NonNullable<DriveFolderState["found"]>) {
  if (found.more) return `${found.fileCount} or more files`;
  return `${found.fileCount} ${found.fileCount === 1 ? "file" : "files"}`;
}

export function DriveFolderForm({ current, action, removeAction }: Props) {
  const [state, formAction, pending] = useActionState(action, {});
  return (
    <div className="bfm-card app-form" aria-labelledby="drive-folder">
      <div>
        <h2 id="drive-folder" className="heading app-section-title">
          Google Drive photo folder
        </h2>
        <p className="small app-section-text">Cover photos for this project&apos;s posts are picked from this folder.</p>
      </div>
      {current ? (
        <form action={removeAction} className="app-row">
          <p className="body" style={{ margin: 0 }}>
            Current folder: <strong>{current.name}</strong> <span className="small app-muted">(checked {current.checkedAt})</span>
          </p>
          <Button type="submit" variant="ghost" size="sm" disabled={pending}>
            Remove folder
          </Button>
        </form>
      ) : (
        <p className="body app-muted" style={{ margin: 0 }}>
          No folder set yet.
        </p>
      )}
      <form action={formAction} onSubmit={keepValuesOnSubmit(formAction)} className="app-form" noValidate>
        <Field
          label={current ? "Replace with another folder" : "Folder link or ID"}
          name="driveFolder"
          placeholder="https://drive.google.com/drive/folders/..."
          defaultValue={state.value ?? ""}
          help="Paste the folder link. The app checks it can list the folder with your Google connection before saving."
          error={state.error}
        />
        <div className="app-form-actions">
          {state.found && !pending ? (
            <span className="small app-saved" role="status">
              Folder found: {state.found.name}, {filesLine(state.found)}
            </span>
          ) : null}
          <Button type="submit" disabled={pending}>
            {pending ? "Checking" : "Check and save folder"}
          </Button>
        </div>
      </form>
    </div>
  );
}
