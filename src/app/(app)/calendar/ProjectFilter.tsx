"use client";

import { useRouter } from "next/navigation";

// Changing the project reloads the calendar for that project, keeping the month.
export function ProjectFilter({ month, project, projects }: { month: string; project?: string; projects: { id: string; name: string }[] }) {
  const router = useRouter();
  return (
    <select
      className="bfm-input app-cal-filter"
      aria-label="Project"
      value={project ?? ""}
      onChange={(event) => {
        const params = new URLSearchParams({ month });
        if (event.target.value) params.set("project", event.target.value);
        router.push(`/calendar?${params}`);
      }}
    >
      <option value="">All projects</option>
      {projects.map((item) => (
        <option key={item.id} value={item.id}>
          {item.name}
        </option>
      ))}
    </select>
  );
}
