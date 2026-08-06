import Link from "next/link";
import { getAppSettings } from "@/lib/store";

const links = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/platforms", label: "Platforms" },
  { href: "/ats", label: "ATS Connect" },
  { href: "/sourcing", label: "AI Sourcing" },
  { href: "/maria", label: "Maria" },
  { href: "/resumes", label: "Resumes" },
];

export function SiteHeader() {
  const settings = getAppSettings();

  return (
    <header className="sticky top-0 z-40 border-b border-line/80 bg-[#f7fafb]/90 backdrop-blur-md">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-5 py-4">
        <div className="flex items-center gap-3">
          <Link href="/" className="display text-xl font-bold tracking-tight text-ink">
            Signal<span className="text-signal">Hire</span>
          </Link>
          <span
            className={`chip capitalize ${
              settings.atsMode === "live" ? "bg-signal/15 text-signal-deep" : ""
            }`}
          >
            {settings.atsMode} mode
          </span>
        </div>
        <nav className="hidden items-center gap-6 text-sm font-medium text-ink-soft md:flex">
          {links.map((link) => (
            <Link key={link.href} href={link.href} className="hover:text-ink">
              {link.label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          {settings.atsMode === "live" ? (
            <Link href="/api/auth/logout" className="btn btn-secondary text-sm">
              Lock
            </Link>
          ) : null}
          <Link href="/dashboard" className="btn btn-primary text-sm">
            Open workspace
          </Link>
        </div>
      </div>
    </header>
  );
}
