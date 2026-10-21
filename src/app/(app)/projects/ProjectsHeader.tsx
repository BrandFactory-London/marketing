"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { PageHeader } from "@/components/ui/PageHeader";
import { createProjectAction } from "./actions";
import { ProjectForm } from "./ProjectForm";

export function ProjectsHeader({ clients, openWith }: { clients: { id: string; name: string }[]; openWith?: { clientId?: string } }) {
  const [open, setOpen] = useState(Boolean(openWith));
  return (
    <>
      <PageHeader
        eyebrow="Each project is one site that gets marketing content, grouped by client."
        title="Projects"
        actions={
          <Button onClick={() => setOpen((value) => !value)} aria-expanded={open}>
            Add project
          </Button>
        }
      />
      {open ? <ProjectForm clients={clients} clientId={openWith?.clientId} action={createProjectAction} onCancel={() => setOpen(false)} /> : null}
    </>
  );
}
