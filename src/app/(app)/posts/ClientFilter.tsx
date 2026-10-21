"use client";

import { useRouter } from "next/navigation";

// Changing the client reloads the Posts page for that client, keeping the status filter.
export function ClientFilter({ status, client, clients }: { status?: string; client?: string; clients: { id: string; name: string }[] }) {
  const router = useRouter();
  return (
    <select
      className="bfm-input app-cal-filter"
      aria-label="Client"
      value={client ?? ""}
      onChange={(event) => {
        const params = new URLSearchParams();
        if (status) params.set("status", status);
        if (event.target.value) params.set("client", event.target.value);
        const text = params.toString();
        router.push(text ? `/posts?${text}` : "/posts");
      }}
    >
      <option value="">All clients</option>
      {clients.map((item) => (
        <option key={item.id} value={item.id}>
          {item.name}
        </option>
      ))}
    </select>
  );
}
