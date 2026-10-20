import { Suspense } from "react";
import { AccountPanel } from "@/components/AccountPanel";
import { Sidebar } from "@/components/ui/Sidebar";
import { mainNav, settingsNav } from "@/lib/nav";

export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="app-shell">
      <Sidebar
        items={mainNav}
        sections={[{ label: "Settings", items: settingsNav }]}
        footer={
          <Suspense fallback={<div className="app-account" aria-hidden="true" />}>
            <AccountPanel />
          </Suspense>
        }
      />
      <main className="app-main">{children}</main>
    </div>
  );
}
