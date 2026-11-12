export function slugify(value: string) {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return slug || "workspace";
}

export function titleCase(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function formatWhen(value: string | Date, timezone = "UTC") {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

export function formatDay(value: string | Date, timezone = "UTC") {
  const iso = typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value) ? value.slice(0, 10) : "";
  const date = iso ? new Date(`${iso}T12:00:00Z`) : new Date(value);
  return new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

export function money(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

export function dbMessage(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  if (/stock cannot go below zero/i.test(message)) return "Not enough of that input is on hand.";
  if (/dependency cycle/i.test(message)) return "That dependency would create a cycle.";
  if (/duplicate key|unique/i.test(message)) return "That record already exists.";
  if (/invite is invalid/i.test(message)) return "This invite is invalid or expired.";
  if (/password reset is invalid/i.test(message)) return "This reset link is invalid or expired.";
  if (/weights/i.test(message)) return message;
  console.error(JSON.stringify({ level: "error", message }));
  return "Could not save that change.";
}

export const kindLabel: Record<string, string> = {
  farmer: "Farm",
  engineer: "Engineering",
  teacher: "Teaching",
  student: "Study",
  practice: "Practice",
};

export const rolesForKind: Record<string, string[]> = {
  farmer: ["manager", "operator", "advisor", "viewer"],
  engineer: ["lead", "member", "reviewer"],
  teacher: ["teacher", "assistant", "student"],
  student: [],
  practice: ["contributor", "observer"],
};
