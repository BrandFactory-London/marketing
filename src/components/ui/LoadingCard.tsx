import { Card } from "./Card";

// Shown while a page's data streams in. Still, with no shimmer: the design system keeps skeletons and
// shimmer for work Claude is generating (design/system/README.md, Motion).
export function LoadingCard({ minHeight = 240 }: { minHeight?: number }) {
  return (
    <Card aria-busy="true" className="app-loading" style={{ minHeight }}>
      <p className="small app-muted" style={{ margin: 0 }}>
        Loading
      </p>
    </Card>
  );
}
