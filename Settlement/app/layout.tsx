import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import { DataProvider } from "@/lib/data-store";
import { Sidebar } from "@/components/layout/sidebar";
import { Header } from "@/components/layout/header";

export const metadata: Metadata = {
  title: "Settlements CRM",
  description: "Debt settlement analytics CRM"
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body>
        <DataProvider>
          <Sidebar />
          <Header />
          <main className="min-h-screen px-4 py-6 lg:ml-64 lg:px-8">{children}</main>
        </DataProvider>
      </body>
    </html>
  );
}
