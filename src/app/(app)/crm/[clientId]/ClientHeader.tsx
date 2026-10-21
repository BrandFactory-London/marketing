"use client";

import { useCallback, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Breadcrumb, PageHeader } from "@/components/ui/PageHeader";
import { updateClientAction } from "../actions";
import { ClientForm } from "../ClientForm";

type Props = { client: { id: string; name: string; mainContact: string | null; email: string | null; phone: string | null } };

export function ClientHeader({ client }: Props) {
  const [editing, setEditing] = useState(false);
  const close = useCallback(() => setEditing(false), []);
  const contact = [client.mainContact, client.email, client.phone].filter(Boolean).join(" · ");
  return (
    <>
      <PageHeader
        eyebrow={<Breadcrumb items={[{ label: "CRM", href: "/crm" }, { label: client.name }]} />}
        title={client.name}
        meta={contact || "No contact details yet"}
        actions={
          <Button variant="secondary" onClick={() => setEditing((value) => !value)} aria-expanded={editing}>
            Edit client
          </Button>
        }
      />
      {editing ? (
        <ClientForm
          title="Edit client"
          submitLabel="Save client"
          action={updateClientAction.bind(null, client.id)}
          initial={{ name: client.name, mainContact: client.mainContact ?? "", email: client.email ?? "", phone: client.phone ?? "" }}
          onDone={close}
        />
      ) : null}
    </>
  );
}
