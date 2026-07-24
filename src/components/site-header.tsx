import Link from "next/link";

const links = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/platforms", label: "Platforms" },
  { href: "/ats", label: "ATS Connect" },
  { href: "/sourcing", label: "AI Sourcing" },
  { href: "/maria", label: "Maria" },
  { href: "/resumes", label: "Resumes" },
];

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-line/80 bg-[#f7fafb]/90 backdrop-blur-md">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-5 py-4">
        <Link href="/" className="display text-xl font-bold tracking-tight text-ink">
          Signal<span className="text-signal">Hire</span>
        </Link>
        <nav className="hidden items-center gap-6 text-sm font-medium text-ink-soft md:flex">
          {links.map((link) => (
            <Link key={link.href} href={link.href} className="hover:text-ink">
              {link.label}
            </Link>
          ))}
        </nav>
        <Link href="/dashboard" className="btn btn-primary text-sm">
          Open workspace
        </Link>
      </div>
    </header>
  );
}
