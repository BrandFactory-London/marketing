"use client";

import { useCallback, useState } from "react";
import { Button } from "@/components/ui/Button";
import { PageHeader } from "@/components/ui/PageHeader";
import { createClientAction } from "./actions";
import { ClientForm } from "./ClientForm";

// The CRM header with "Add client", which opens the form under it (CRM prototype).
export function CrmHeader() {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  return (
    <>
      <PageHeader
        eyebrow="Clients, their projects and the runs they are on."
        title="CRM"
        actions={
          <Button onClick={() => setOpen((value) => !value)} aria-expanded={open}>
            Add client
          </Button>
        }
      />
      {open ? <ClientForm title="Add a client" submitLabel="Save client" action={createClientAction} onDone={close} /> : null}
    </>
  );
}
