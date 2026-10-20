import type { Metadata } from "next";
import "../../design/system/tokens.css";
import "../../design/system/components/bundle.css";
import "./app.css";

export const metadata: Metadata = {
  title: { default: "BrandFactory Marketing", template: "%s | BrandFactory Marketing" },
  description: "Turns client knowledge into approved content.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en-GB">
      <body className="bfm-root">{children}</body>
    </html>
  );
}
