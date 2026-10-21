import { LinkTabs } from "@/components/ui/LinkTabs";
import { settingsNav } from "@/lib/nav";

export function SettingsTabs() {
  return <LinkTabs label="Settings sections" tabs={settingsNav} />;
}
