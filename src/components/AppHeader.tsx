import Image from "next/image";
import Link from "next/link";
import { LogOut } from "lucide-react";
import { signOut } from "@/app/login/actions";

interface AppHeaderProps {
  /** Which top-level section is open; that nav item is marked. Null on a gate's dashboard. */
  active: "map" | "admin" | null;
  /** Shows the Admin link. The admin pages re-check the role themselves. */
  isAdmin: boolean;
}

/** The product mark (public/logo-mark.png). Decorative: the product name always sits next to it as text. */
export function BrandMark({ className = "size-7" }: { className?: string }) {
  return <Image src="/logo-mark.png" alt="" width={128} height={128} className={className} />;
}

/** The mark with the name set beside it (public/logo.png). Put it inside the page's h1; `alt` names the product. */
export function Wordmark({ className = "h-16 w-auto" }: { className?: string }) {
  return <Image src="/logo.png" alt="Water Gate Way" width={480} height={177} priority className={className} />;
}

// WHY: no "use client"; it has no state, only links and a server-action form, so the client dashboard
// can import it too (the server action reference crosses the boundary like any import).
// WHY: the product name is not an h1; each page owns its one h1.
export default function AppHeader({ active, isAdmin }: AppHeaderProps) {
  return (
    <header className="z-[1000] flex h-12 shrink-0 items-center justify-between gap-3 border-b border-border bg-surface px-4 sm:px-6">
      <Link href="/" className="flex min-w-0 items-center gap-2 rounded-md">
        <BrandMark />
        {/* On a phone the mark alone carries the brand; the name stays for screen readers. */}
        <span className="sr-only truncate text-base font-bold text-fg sm:not-sr-only">Water Gate Way</span>
      </Link>

      <div className="flex shrink-0 items-center gap-1">
        <nav aria-label="เมนูหลัก" className="flex items-center gap-1">
          <NavItem href="/" current={active === "map"}>
            แผนที่
          </NavItem>
          {isAdmin && (
            <NavItem href="/admin" current={active === "admin"}>
              ผู้ดูแลระบบ
            </NavItem>
          )}
        </nav>

        <form action={signOut}>
          {/* WHY: the word stays visible at every width; a phone user must find sign-out without guessing. */}
          <button
            type="submit"
            className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-md px-2.5 text-sm text-muted transition-colors duration-150 hover:bg-surface-2 hover:text-fg"
          >
            <LogOut className="size-4" strokeWidth={1.75} aria-hidden="true" />
            ออกจากระบบ
          </button>
        </form>
      </div>
    </header>
  );
}

/** Current section: a neutral grey pill with the label in ink; no brand colour in the chrome. */
function NavItem({ href, current, children }: { href: string; current: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      aria-current={current ? "page" : undefined}
      className={`inline-flex h-9 items-center rounded-md px-3 text-sm transition-colors duration-150 ${
        current ? "bg-surface-2 font-bold text-fg" : "text-muted hover:bg-surface-2 hover:text-fg"
      }`}
    >
      {children}
    </Link>
  );
}
