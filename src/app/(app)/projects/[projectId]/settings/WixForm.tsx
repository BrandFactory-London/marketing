"use client";

import { useActionState, useState, useTransition } from "react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Field, SelectField } from "@/components/ui/Field";
import type { WixCheckResult, WixSettingsView } from "@/lib/wix-credentials";
import type { WixMembersState, WixState } from "./actions";

type Current = Omit<WixSettingsView, "checkedAt"> & { checkedAt: string | null };

type Props = {
  current: Current | null;
  saveAction: (state: WixState, formData: FormData) => Promise<WixState>;
  checkAction: () => Promise<WixCheckResult>;
  removeAction: () => Promise<void>;
  loadMembersAction: () => Promise<WixMembersState>;
  chooseMemberAction: (memberId: string) => Promise<WixMembersState>;
};

// Wix publishing credentials for this project (design decision 6, γ6 orientation Q1). The key is never shown again,
// only its last four characters.
export function WixForm({ current, saveAction, checkAction, removeAction, loadMembersAction, chooseMemberAction }: Props) {
  const [state, formAction, pending] = useActionState(saveAction, {});
  const [check, setCheck] = useState<WixCheckResult | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [busy, startTransition] = useTransition();
  const shownCheck = check ?? (current?.checkedAt && current.checkOk !== null ? { ok: current.checkOk, message: current.checkMessage ?? "" } : null);

  return (
    <div className="bfm-card app-form" aria-labelledby="wix-heading">
      <div>
        <h2 id="wix-heading" className="heading app-section-title">
          Wix Blog publishing
        </h2>
        <p className="small app-section-text">
          Create an API key in Wix&apos;s API Keys Manager on the account that owns the site, limited to this site, with Manage Blog, Read Blog, Read Draft Blog Posts, Read
          Members and Manage Media Manager. Stored encrypted.
        </p>
      </div>

      {current ? (
        <div className="app-stack">
          <div className="app-row">
            <p className="body" style={{ margin: 0 }}>
              Key ending <strong>{current.keyHint}</strong>
              {current.checkedAt ? <span className="small app-muted"> (checked {current.checkedAt})</span> : null}
            </p>
            {shownCheck ? <Badge tone={shownCheck.ok ? "success" : "danger"}>{shownCheck.ok ? "Connected" : "Not working"}</Badge> : <Badge>Not checked</Badge>}
          </div>
          {shownCheck ? (
            <p className={`small ${shownCheck.ok ? "app-muted" : "app-form-error"}`} role="status" style={{ margin: 0 }}>
              {shownCheck.message}
            </p>
          ) : null}
          <div className="app-row">
            <Button variant="secondary" size="sm" disabled={busy} onClick={() => startTransition(async () => setCheck(await checkAction()))}>
              {busy ? "Checking connection" : "Check connection"}
            </Button>
            {confirmRemove ? (
              <>
                <span className="small">Remove the Wix credentials? Publishing stops until new ones are added.</span>
                <Button variant="danger" size="sm" disabled={busy} onClick={() => startTransition(async () => { await removeAction(); setConfirmRemove(false); setCheck(null); })}>
                  Remove credentials
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setConfirmRemove(false)}>
                  Keep credentials
                </Button>
              </>
            ) : (
              <Button variant="ghost" size="sm" onClick={() => setConfirmRemove(true)}>
                Remove credentials
              </Button>
            )}
          </div>
          <MemberPicker current={current} loadAction={loadMembersAction} chooseAction={chooseMemberAction} />
        </div>
      ) : (
        <p className="body app-muted" style={{ margin: 0 }}>
          No Wix credentials yet. Posts for this project cannot be published until they are added.
        </p>
      )}

      <form action={formAction} className="app-form" noValidate>
        <Field label={current ? "Replace the API key" : "API key"} name="apiKey" type="password" autoComplete="off" error={state.errors?.apiKey} help="Shown once in Wix when you create it." />
        <Field label="Account ID" name="accountId" defaultValue={state.accountId ?? ""} autoComplete="off" error={state.errors?.accountId} help="Shown in the API Keys Manager." />
        <Field label="Site ID" name="siteId" defaultValue={state.siteId ?? ""} autoComplete="off" error={state.errors?.siteId} help="The part after /dashboard/ in the site's dashboard address." />
        <div className="app-form-actions">
          {state.message ? (
            <span className="small app-form-error" role="alert">
              {state.message}
            </span>
          ) : null}
          {state.saved && !pending ? (
            <span className="small app-saved" role="status">
              Credentials saved. {state.check?.message}
            </span>
          ) : null}
          <Button type="submit" disabled={pending}>
            {pending ? "Saving and checking" : "Save and check credentials"}
          </Button>
        </div>
      </form>
    </div>
  );
}

function MemberPicker({
  current,
  loadAction,
  chooseAction,
}: {
  current: Current;
  loadAction: () => Promise<WixMembersState>;
  chooseAction: (memberId: string) => Promise<WixMembersState>;
}) {
  const [state, setState] = useState<WixMembersState>({});
  const [memberId, setMemberId] = useState(current.memberId ?? "");
  const [pending, startTransition] = useTransition();
  return (
    <div className="app-stack">
      <p className="body" style={{ margin: 0 }}>
        Author: {current.memberName ? <strong>{current.memberName}</strong> : <span className="app-muted">not chosen yet. Posts cannot be published until it is.</span>}
      </p>
      {state.members ? (
        <div className="app-row">
          <SelectField
            label="Publish posts as"
            value={memberId}
            onChange={(event) => setMemberId(event.target.value)}
            options={[{ value: "", label: "Choose a member" }, ...state.members.map((member) => ({ value: member.id, label: member.nickname }))]}
          />
          <Button size="sm" disabled={pending || !memberId} onClick={() => startTransition(async () => setState({ ...state, ...(await chooseAction(memberId)) }))}>
            Save author
          </Button>
        </div>
      ) : (
        <div>
          <Button variant="secondary" size="sm" disabled={pending} onClick={() => startTransition(async () => setState(await loadAction()))}>
            {pending ? "Loading members" : current.memberName ? "Change author" : "Choose author"}
          </Button>
        </div>
      )}
      {state.error ? (
        <p className="small app-form-error" role="alert" style={{ margin: 0 }}>
          {state.error}
        </p>
      ) : null}
      {state.chosen ? (
        <p className="small app-saved" role="status" style={{ margin: 0 }}>
          Posts will be published as {state.chosen}.
        </p>
      ) : null}
    </div>
  );
}
