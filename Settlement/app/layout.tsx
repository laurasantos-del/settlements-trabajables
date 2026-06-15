import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import { Sidebar } from "@/components/layout/sidebar";

export const metadata: Metadata = {
  title: "Settlements CRM",
  description: "Debt settlement analytics CRM"
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body>
        <Sidebar />
        <main className="min-h-screen px-4 py-6 lg:ml-[240px] lg:px-8">{children}</main>
      </body>
    </html>
  );
}
