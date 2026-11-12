"use client";

import Link from "next/link";
import { useState } from "react";
import type { NavItem } from "@/lib/nav";

export function MobileNav({ items }: { items: NavItem[] }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="md:hidden">
      <button type="button" className="btn-secondary" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
        Menu
      </button>
      {open ? (
        <div className="mt-3 flex flex-col">
          {items.map((item) => (
            <Link key={item.href} className="nav-link" href={item.href} onClick={() => setOpen(false)}>{item.label}</Link>
          ))}
        </div>
      ) : null}
    </div>
  );
}
