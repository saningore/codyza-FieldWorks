export type GradeItem = {
  categoryId: string;
  points: number;
  score: number | null;
  excused: boolean;
  missing: boolean;
  posted: boolean;
};

export type GradeCategory = {
  id: string;
  weight: number;
  dropLowest: number;
};

export type CourseGrade = {
  overall: number | null;
  reason: string | null;
  categories: { id: string; average: number | null; note: string | null }[];
};

function round2(value: number) {
  return Math.round(value * 100) / 100;
}

export function courseGrade(input: {
  mode: "total_points" | "weighted";
  categories: GradeCategory[];
  items: GradeItem[];
  missingCountsAsZero: boolean;
}): CourseGrade {
  const countedFor = (categoryId: string) => {
    const rows = input.items.filter((item) => item.categoryId === categoryId && item.posted && !item.excused);
    const usable = rows.flatMap((item) => {
      if (item.score != null) return [{ points: item.points, score: item.score }];
      if (item.missing && input.missingCountsAsZero) return [{ points: item.points, score: 0 }];
      return [];
    });
    const drop = input.categories.find((category) => category.id === categoryId)?.dropLowest ?? 0;
    if (drop <= 0 || drop >= usable.length) {
      return {
        rows: usable,
        note: drop >= usable.length && usable.length > 0 && drop > 0 ? "Drop lowest was not applied because it would remove every score." : null,
      };
    }
    const ranked = [...usable].sort((a, b) => a.score / a.points - b.score / b.points);
    return { rows: ranked.slice(drop), note: null };
  };

  if (input.mode === "total_points") {
    const rows = input.categories.length > 0
      ? input.categories.flatMap((category) => countedFor(category.id).rows)
      : input.items.flatMap((item) => {
          if (!item.posted || item.excused) return [];
          if (item.score != null) return [{ points: item.points, score: item.score }];
          if (item.missing && input.missingCountsAsZero) return [{ points: item.points, score: 0 }];
          return [];
        });
    if (rows.length === 0) return { overall: null, reason: "Nothing graded has been posted.", categories: [] };
    const possible = rows.reduce((sum, row) => sum + row.points, 0);
    const earned = rows.reduce((sum, row) => sum + row.score, 0);
    return { overall: possible > 0 ? round2((earned / possible) * 100) : null, reason: null, categories: [] };
  }

  const weight = input.categories.reduce((sum, category) => sum + category.weight, 0);
  if (Math.round(weight) !== 100) {
    return { overall: null, reason: "Category weights must sum to 100 before an overall grade is available.", categories: [] };
  }

  const categories = input.categories.map((category) => {
    const counted = countedFor(category.id);
    if (counted.rows.length === 0) return { id: category.id, average: null, note: counted.note };
    const possible = counted.rows.reduce((sum, row) => sum + row.points, 0);
    const earned = counted.rows.reduce((sum, row) => sum + row.score, 0);
    return { id: category.id, average: possible > 0 ? round2((earned / possible) * 100) : null, note: counted.note };
  });

  const missing = input.categories.filter((category) => category.weight > 0 && categories.find((row) => row.id === category.id)?.average == null);
  if (missing.length > 0) {
    return { overall: null, reason: "An overall grade waits until every weighted category has a posted score.", categories };
  }
  const overall = input.categories.reduce((sum, category) => {
    const average = categories.find((row) => row.id === category.id)?.average ?? 0;
    return sum + (average * category.weight) / 100;
  }, 0);
  return { overall: round2(overall), reason: null, categories };
}

export function completionRate(activeStudents: number, submitted: number) {
  if (activeStudents <= 0) return null;
  return submitted / activeStudents;
}

export function applyLatePenalty(input: {
  raw: number;
  possible: number;
  dueAt: string | null;
  submittedAt: string;
  percentPerDay: number;
  capPercent: number;
}) {
  if (!input.dueAt || Date.parse(input.submittedAt) <= Date.parse(input.dueAt) || input.percentPerDay <= 0) {
    return { score: input.raw, deducted: 0 };
  }
  const days = Math.ceil((Date.parse(input.submittedAt) - Date.parse(input.dueAt)) / 86_400_000);
  const pct = Math.min(input.capPercent, days * input.percentPerDay);
  const deducted = Math.min(input.raw, (input.possible * pct) / 100);
  return { score: Math.max(0, Math.round((input.raw - deducted) * 100) / 100), deducted: Math.round(deducted * 100) / 100 };
}

export function fieldStatus(input: {
  override: string | null;
  hasPlanting: boolean;
  hasHarvest: boolean;
  expectedHarvest: string | null;
  today: string;
}) {
  if (input.override) return input.override;
  if (input.hasHarvest) return "harvested";
  if (input.expectedHarvest && input.today > input.expectedHarvest) return "overdue";
  if (input.hasPlanting) return "in season";
  return "planned";
}

export function reiUntil(completedOn: string | null, hours: number | null) {
  if (!completedOn || hours == null) return null;
  return new Date(Date.parse(`${completedOn}T00:00:00Z`) + hours * 3_600_000).toISOString();
}

export function fieldEconomics(input: {
  acres: number | null;
  loads: { quantity: number; salePriceCents: number | null }[];
  expenseCents: number;
}) {
  const yieldTotal = input.loads.reduce((sum, load) => sum + load.quantity, 0);
  const priced = input.loads.filter((load) => load.salePriceCents != null);
  const missingPriceLoads = input.loads.length - priced.length;
  const revenueCents = priced.reduce((sum, load) => sum + load.quantity * (load.salePriceCents ?? 0), 0);
  const acres = input.acres && input.acres > 0 ? input.acres : null;
  return {
    yieldTotal,
    yieldPerAcre: acres ? yieldTotal / acres : null,
    costPerAcreCents: acres ? input.expenseCents / acres : null,
    revenueCents: priced.length > 0 ? revenueCents : null,
    costCents: input.expenseCents,
    marginCents: input.loads.length > 0 && missingPriceLoads === 0 ? revenueCents - input.expenseCents : null,
    missingPriceLoads,
  };
}

export function polygonAcres(ring: [number, number][]) {
  if (ring.length < 4) return 0;
  const earth = 6378137;
  const lat0 = (ring[0][1] * Math.PI) / 180;
  const meters = ring.map(([lng, lat]) => [
    ((lng * Math.PI) / 180) * Math.cos(lat0) * earth,
    ((lat * Math.PI) / 180) * earth,
  ]);
  let sum = 0;
  for (let index = 0; index < meters.length - 1; index += 1) {
    sum += meters[index][0] * meters[index + 1][1] - meters[index + 1][0] * meters[index][1];
  }
  return Math.abs(sum) / 2 / 4046.8564224;
}

export function milestoneProgress(statuses: string[]) {
  if (statuses.length === 0) return { label: "No issues linked", ratio: null as number | null };
  const completed = statuses.filter((status) => status === "completed").length;
  return { label: `${completed} of ${statuses.length}`, ratio: completed / statuses.length };
}

export type PathNode = { id: string; days: number };
export type PathEdge = { from: string; to: string };

export function criticalPath(nodes: PathNode[], edges: PathEdge[]) {
  const ids = nodes.map((node) => node.id);
  const incoming = new Map(ids.map((id) => [id, [] as string[]]));
  const outgoing = new Map(ids.map((id) => [id, [] as string[]]));
  for (const edge of edges) {
    if (!incoming.has(edge.to) || !outgoing.has(edge.from)) continue;
    incoming.get(edge.to)?.push(edge.from);
    outgoing.get(edge.from)?.push(edge.to);
  }
  const indegree = new Map(ids.map((id) => [id, incoming.get(id)?.length ?? 0]));
  const queue = ids.filter((id) => indegree.get(id) === 0);
  const order: string[] = [];
  while (queue.length) {
    const id = queue.shift()!;
    order.push(id);
    for (const next of outgoing.get(id) ?? []) {
      indegree.set(next, (indegree.get(next) ?? 0) - 1);
      if (indegree.get(next) === 0) queue.push(next);
    }
  }
  if (order.length !== ids.length) return { days: null as number | null, path: [] as string[] };
  const days = new Map(nodes.map((node) => [node.id, node.days]));
  const best = new Map(ids.map((id) => [id, 0]));
  const prev = new Map<string, string | null>(ids.map((id) => [id, null]));
  for (const id of order) {
    best.set(id, (best.get(id) ?? 0) + (days.get(id) ?? 0));
    for (const next of outgoing.get(id) ?? []) {
      const candidate = best.get(id) ?? 0;
      if (candidate > (best.get(next) ?? 0)) {
        best.set(next, candidate);
        prev.set(next, id);
      }
    }
  }
  let end = ids[0];
  for (const id of ids) if ((best.get(id) ?? 0) > (best.get(end) ?? 0)) end = id;
  const path: string[] = [];
  for (let cursor: string | null = end; cursor; cursor = prev.get(cursor) ?? null) path.push(cursor);
  path.reverse();
  return { days: best.get(end) ?? 0, path };
}

export function dependencyViolations(
  issues: { id: string; start: string | null; end: string | null }[],
  edges: PathEdge[],
) {
  const byId = new Map(issues.map((issue) => [issue.id, issue]));
  return edges.filter((edge) => {
    const predecessor = byId.get(edge.from);
    const successor = byId.get(edge.to);
    if (!predecessor?.end || !successor?.start) return false;
    return successor.start < predecessor.end;
  });
}

export function recordedCourseGrade(items: { weight: number; earned: number | null; possible: number; status: string }[]) {
  const active = items.filter((item) => item.status !== "excused");
  const graded = active.filter((item) => item.status === "graded" && item.earned != null && item.possible > 0);
  const weightTotal = active.reduce((sum, item) => sum + item.weight, 0);
  const weightCovered = graded.reduce((sum, item) => sum + item.weight, 0);
  if (weightCovered <= 0) return { percent: null as number | null, weightCovered, weightTotal };
  const earned = graded.reduce((sum, item) => sum + item.weight * ((item.earned ?? 0) / item.possible), 0);
  return { percent: round2((earned / weightCovered) * 100), weightCovered, weightTotal };
}

export function gpa(
  courses: { credits: number; percent: number | null; include: boolean }[],
  scale: { min: number; points: number }[],
) {
  const graded = courses.filter((course) => course.include && course.percent != null && course.credits > 0);
  const credits = graded.reduce((sum, course) => sum + course.credits, 0);
  if (credits <= 0) return null;
  const ordered = [...scale].sort((a, b) => b.min - a.min);
  const points = graded.reduce((sum, course) => {
    const band = ordered.find((row) => (course.percent ?? 0) >= row.min);
    return sum + course.credits * (band?.points ?? 0);
  }, 0);
  return Math.round((points / credits) * 100) / 100;
}

export function billableAmount(minutes: number, rateCentsPerHour: number | null) {
  if (rateCentsPerHour == null) return null;
  return Math.round((minutes / 60) * rateCentsPerHour);
}

export function studyMinutes(startedAt: string, endedAt: string | null, confirmed: boolean) {
  if (!endedAt) return null;
  const minutes = Math.round((Date.parse(endedAt) - Date.parse(startedAt)) / 60_000);
  if (minutes <= 0) return null;
  if (minutes > 240 && !confirmed) return null;
  return minutes;
}

export function sumBy<T>(rows: T[], key: (row: T) => string, value: (row: T) => number) {
  const totals = new Map<string, number>();
  for (const row of rows) totals.set(key(row), (totals.get(key(row)) ?? 0) + value(row));
  return [...totals.entries()].map(([label, total]) => ({ label, value: total }));
}
