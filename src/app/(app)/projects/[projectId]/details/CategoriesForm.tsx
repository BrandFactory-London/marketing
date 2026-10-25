"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import type { CategoryState } from "./actions";

type Props = {
  categories: { id: string; label: string }[];
  other: string;
  action: (state: CategoryState, formData: FormData) => Promise<CategoryState>;
  removeAction: (categoryId: string) => Promise<void>;
};

// The project's topic categories (Phase 2 A3). The planner gives each planned post one; the last is always Other.
export function CategoriesForm({ categories, other, action, removeAction }: Props) {
  const [state, formAction, pending] = useActionState(action, {});
  return (
    <div className="bfm-card app-form" aria-labelledby="categories-heading">
      <div>
        <h2 id="categories-heading" className="heading app-section-title">
          Topic categories
        </h2>
        <p className="small app-section-text">The planner puts each planned post in one. {other} is always there, last.</p>
      </div>
      <ul className="app-pillars">
        {categories.map((category) => (
          <li key={category.id} className="app-row">
            <span className="body">{category.label}</span>
            <form action={removeAction.bind(null, category.id)}>
              <Button type="submit" variant="ghost" size="sm" aria-label={`Remove category ${category.label}`}>
                Remove category
              </Button>
            </form>
          </li>
        ))}
        <li className="app-row">
          <span className="body app-muted">{other}</span>
        </li>
      </ul>
      <form action={formAction} className="app-form" noValidate>
        <Field label="Category name" name="label" defaultValue={state.value ?? ""} placeholder="e.g. Cost" maxLength={40} error={state.error} />
        <div className="app-form-actions">
          {state.added && !pending ? (
            <span className="small app-saved" role="status">
              Category added: {state.added}
            </span>
          ) : null}
          <Button type="submit" disabled={pending}>
            {pending ? "Adding" : "Add category"}
          </Button>
        </div>
      </form>
    </div>
  );
}
