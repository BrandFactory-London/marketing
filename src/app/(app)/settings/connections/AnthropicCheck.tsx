"use client";

import { useActionState } from "react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { checkAnthropicAction, type AnthropicCheckState } from "./actions";

export function AnthropicCheck() {
  const [state, action, pending] = useActionState<AnthropicCheckState>(checkAnthropicAction, {});
  return (
    <>
      <span>
        <span className="subheading">Anthropic API</span>
        <br />
        <span className="small app-muted">
          {state.message ?? "The key lives in Trigger.dev, where every model call runs. The check makes one tiny call on Claude Haiku 5.5."}
        </span>
      </span>
      <span className="app-row">
        {state.ok === undefined ? <Badge>Not checked</Badge> : <Badge tone={state.ok ? "success" : "danger"}>{state.ok ? "Connected" : "Not working"}</Badge>}
        <form action={action}>
          <Button type="submit" variant="secondary" size="sm" disabled={pending}>
            {pending ? "Checking connection" : "Check connection"}
          </Button>
        </form>
      </span>
    </>
  );
}
