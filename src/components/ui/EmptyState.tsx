import { Card } from "./Card";

export function EmptyState({ title, text }: { title: string; text: string }) {
  return (
    <Card className="app-empty">
      <h2 className="heading app-empty-title">{title}</h2>
      <p className="body app-empty-text">{text}</p>
    </Card>
  );
}
