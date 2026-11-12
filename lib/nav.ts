export type NavItem = { href: string; label: string };

export function navFor(org: { kind: string; slug: string; can: (permission: string) => boolean }): NavItem[] {
  const base = `/o/${org.slug}`;
  const items: NavItem[] = [{ href: base, label: "Overview" }];
  if (org.kind === "farmer") {
    items.push({ href: `${base}/fields`, label: "Fields" }, { href: `${base}/map`, label: "Map" }, { href: `${base}/calendar`, label: "Calendar" });
    if (org.can("stock.read")) items.push({ href: `${base}/inputs`, label: "Inputs" });
    if (org.can("field.read")) items.push({ href: `${base}/charts`, label: "Charts" });
  }
  if (org.kind === "engineer") {
    items.push({ href: `${base}/projects`, label: "Projects" }, { href: `${base}/timeline`, label: "Timeline" }, { href: `${base}/decisions`, label: "Decisions" });
  }
  if (org.kind === "teacher") {
    items.push({ href: `${base}/sections`, label: "Classes" });
  }
  if (org.kind === "student") {
    items.push({ href: `${base}/courses`, label: "Courses" }, { href: `${base}/week`, label: "Week" }, { href: `${base}/places`, label: "Places" });
  }
  if (org.kind === "practice") {
    items.push(
      { href: `${base}/clients`, label: "Clients" },
      { href: `${base}/engagements`, label: "Engagements" },
      { href: `${base}/time`, label: "Time" },
      { href: `${base}/decisions`, label: "Decisions" },
    );
  }
  items.push({ href: `${base}/activity`, label: "Activity" });
  if (org.can("member.invite") || org.can("org.manage")) items.push({ href: `${base}/settings`, label: "Settings" });
  return items;
}
