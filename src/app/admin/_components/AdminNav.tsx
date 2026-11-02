"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/admin", label: "ภาพรวม" },
  { href: "/admin/users", label: "ผู้ใช้" },
  { href: "/admin/gates", label: "ประตูน้ำ" },
] as const;

/** Admin sub-navigation as tabs. "/admin" matches only exactly; the other tabs match their prefix. */
export default function AdminNav() {
  const pathname = usePathname();
  return (
    // WHY: overflow-x-auto alone makes overflow-y auto too (CSS rule); the old -mb-px underline and the
    // inline line box overflowed by a few px and showed a vertical scrollbar. Clip y; tabs still scroll sideways.
    <nav aria-label="ส่วนของผู้ดูแลระบบ" className="overflow-x-auto overflow-y-hidden border-b border-border">
      <ul className="flex min-w-max gap-1">
        {TABS.map((tab) => {
          const current = tab.href === "/admin" ? pathname === "/admin" : pathname.startsWith(tab.href);
          return (
            <li key={tab.href} className="flex">
              <Link
                href={tab.href}
                aria-current={current ? "page" : undefined}
                className={`flex min-h-11 cursor-pointer items-center border-b-2 px-3 text-sm font-bold transition-colors duration-150 ${
                  current ? "border-fg text-fg" : "border-transparent text-muted hover:border-control hover:text-fg"
                }`}
              >
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
