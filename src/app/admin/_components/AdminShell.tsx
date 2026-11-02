import type { ReactNode } from "react";
import AppHeader from "@/components/AppHeader";
import AdminNav from "./AdminNav";

/** Frame shared by every admin view: app bar, section tabs, then the view's one h1 and its scope line. */
export default function AdminShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-dvh flex-col bg-bg">
      <AppHeader active="admin" isAdmin />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 pt-4 pb-12 sm:px-6">
        <AdminNav />
        <div className="mt-6 mb-6">
          <h1 className="text-2xl font-bold text-fg">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-muted tabular-nums">{subtitle}</p>}
        </div>
        {children}
      </main>
    </div>
  );
}
