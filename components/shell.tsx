import Link from "next/link";
import { MobileNav } from "@/components/mobile-nav";
import { kindLabel } from "@/lib/format";
import { navFor } from "@/lib/nav";
import { logout } from "@/server/auth-actions";
import type { OrgContext } from "@/server/context";

export function Shell({ org, children }: { org: OrgContext; children: React.ReactNode }) {
  const items = navFor(org);
  return (
    <div className="mx-auto grid max-w-6xl gap-6 px-4 py-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link className="text-sm font-bold text-field" href="/">FieldWorks</Link>
          <p className="font-serif text-3xl">{org.orgName}</p>
          <p className="text-sm text-ink/70">{kindLabel[org.kind] ?? org.kind} · {org.role}</p>
        </div>
        <form action={logout}>
          <button className="btn-secondary">Log out</button>
        </form>
      </header>
      {org.demo ? (
        <p className="rounded-2xl bg-sand px-4 py-3 text-sm font-bold">Sample organization. The figures on these pages sum the stored sample rows.</p>
      ) : null}
      <MobileNav items={items} />
      <nav className="hidden flex-wrap gap-1 md:flex" aria-label="Workspace">
        {items.map((item) => (
          <Link key={item.href} className="nav-link" href={item.href}>{item.label}</Link>
        ))}
      </nav>
      <div id="main">{children}</div>
    </div>
  );
}
