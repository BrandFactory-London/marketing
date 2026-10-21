"use client";

import { useRouter } from "next/navigation";
import { useId } from "react";

// Choosing a project reloads the form with that project's slots and knowledge.
export function ProjectChoice({ project, projects }: { project?: string; projects: { id: string; name: string }[] }) {
  const router = useRouter();
  const id = useId();
  return (
    <div className="bfm-field">
      <label className="bfm-label" htmlFor={id}>
        Project
      </label>
      <select
        id={id}
        className="bfm-input"
        value={project ?? ""}
        onChange={(event) => router.push(event.target.value ? `/batches/new?project=${event.target.value}` : "/batches/new")}
      >
        <option value="">Choose a project</option>
        {projects.map((item) => (
          <option key={item.id} value={item.id}>
            {item.name}
          </option>
        ))}
      </select>
    </div>
  );
}
