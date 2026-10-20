import { PageHeader } from "@/components/ui/PageHeader";
import { SettingsTabs } from "./SettingsTabs";

export default function SettingsLayout({ children }: LayoutProps<"/settings">) {
  return (
    <>
      <PageHeader eyebrow="Rules and defaults that apply across every client and project." title="Settings" />
      <SettingsTabs />
      {children}
    </>
  );
}
