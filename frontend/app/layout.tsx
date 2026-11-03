import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "KubeGuide · Kubernetes, with evidence",
  description:
    "An evidence-first Kubernetes troubleshooting workbench by Ahnaf Khan. Explore source-backed answers, inspect manifests, and follow the retrieval.",
  openGraph: {
    title: "KubeGuide — Kubernetes, with evidence",
    description: "A Kubernetes troubleshooting workbench built by Ahnaf Khan.",
    type: "website",
  },
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
