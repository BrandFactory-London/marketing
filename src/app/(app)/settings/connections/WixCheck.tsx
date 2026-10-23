"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { checkWixRowAction, type WixRowCheck } from "./actions";

type Current = { ok: boolean | null; message: string | null; checkedAt: string | null; author: string | null };

export function WixCheck({ projectId, name, settingsHref, current }: { projectId: string; name: string; settingsHref: string; current: Current | null }) {
  const [result, setResult] = useState<WixRowCheck | null>(null);
  const [pending, startTransition] = useTransition();
  const ok = result?.ok ?? current?.ok ?? null;
  const message = result?.message ?? current?.message;
  return (
    <>
      <span>
        <span className="subheading">{name}</span>
        <br />
        {current ? (
          <span className="small app-muted">
            {message ?? "Not checked yet."}
            {current.checkedAt && !result ? ` Checked ${current.checkedAt}.` : ""} {current.author ? `Publishes as ${current.author}.` : "No author chosen yet."}
          </span>
        ) : (
          <span className="small app-muted">
            No credentials. Add them in the <Link href={settingsHref}>project&apos;s Settings</Link>.
          </span>
        )}
      </span>
      <span className="app-row">
        {!current ? <Badge tone="warning">Not set up</Badge> : ok === null ? <Badge>Not checked</Badge> : <Badge tone={ok ? "success" : "danger"}>{ok ? "Connected" : "Not working"}</Badge>}
        {current ? (
          <Button variant="secondary" size="sm" disabled={pending} onClick={() => startTransition(async () => setResult(await checkWixRowAction(projectId)))}>
            {pending ? "Checking connection" : "Check connection"}
          </Button>
        ) : null}
      </span>
    </>
  );
}
