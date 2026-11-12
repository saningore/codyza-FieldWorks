import { describe, expect, it } from "vitest";
import {
  applyLatePenalty,
  billableAmount,
  courseGrade,
  criticalPath,
  dependencyViolations,
  fieldEconomics,
  fieldStatus,
  gpa,
  milestoneProgress,
  polygonAcres,
  recordedCourseGrade,
  reiUntil,
  studyMinutes,
} from "@/lib/domain";
import { passwordAccepted, passwordProblems } from "@/lib/password";
import { currentTotp } from "@/lib/totp";
import { demoMfa } from "@/db/ids";

describe("password rules", () => {
  it("accepts the sample password and rejects weak ones", () => {
    expect(passwordAccepted("Harbor-lamp-42", "june.okoye@northline.test")).toBe(true);
    expect(passwordProblems("short", "a@b.test")[0]).toMatch(/12/);
    expect(passwordProblems("password123", "a@b.test").join(" ")).toMatch(/common/i);
    expect(passwordProblems("june.okoye-1999", "june.okoye@northline.test").join(" ")).toMatch(/email/i);
    expect(passwordProblems("123456789012", "a@b.test").join(" ")).toMatch(/letter|common/i);
  });
});

describe("grades", () => {
  const categories = [
    { id: "hw", weight: 50, dropLowest: 1 },
    { id: "quiz", weight: 50, dropLowest: 0 },
  ];

  it("drops the lowest score and weights the rest", () => {
    const result = courseGrade({
      mode: "weighted",
      categories,
      missingCountsAsZero: false,
      items: [
        { categoryId: "hw", points: 10, score: 10, excused: false, missing: false, posted: true },
        { categoryId: "hw", points: 10, score: 5, excused: false, missing: false, posted: true },
        { categoryId: "quiz", points: 10, score: 8, excused: false, missing: false, posted: true },
      ],
    });
    expect(result.overall).toBe(90);
  });

  it("refuses an overall when a weighted category has no posted score", () => {
    const result = courseGrade({
      mode: "weighted",
      categories,
      missingCountsAsZero: false,
      items: [{ categoryId: "quiz", points: 10, score: 8, excused: false, missing: false, posted: true }],
    });
    expect(result.overall).toBeNull();
    expect(result.reason).toMatch(/weighted category/);
  });

  it("does not drop the only remaining score", () => {
    const result = courseGrade({
      mode: "total_points",
      categories: [{ id: "hw", weight: 100, dropLowest: 1 }],
      missingCountsAsZero: false,
      items: [{ categoryId: "hw", points: 10, score: 7, excused: false, missing: false, posted: true }],
    });
    expect(result.overall).toBe(70);
  });

  it("skips excused work and can count missing work as zero", () => {
    const excused = courseGrade({
      mode: "total_points",
      categories: [],
      missingCountsAsZero: false,
      items: [
        { categoryId: "hw", points: 10, score: 10, excused: true, missing: false, posted: true },
        { categoryId: "hw", points: 10, score: 8, excused: false, missing: false, posted: true },
      ],
    });
    expect(excused.overall).toBe(80);
    const missing = courseGrade({
      mode: "total_points",
      categories: [],
      missingCountsAsZero: true,
      items: [
        { categoryId: "hw", points: 10, score: null, excused: false, missing: true, posted: true },
        { categoryId: "hw", points: 10, score: 10, excused: false, missing: false, posted: true },
      ],
    });
    expect(missing.overall).toBe(50);
  });

  it("deducts a capped late penalty from the possible points", () => {
    const result = applyLatePenalty({
      raw: 10,
      possible: 10,
      dueAt: "2026-01-01T00:00:00Z",
      submittedAt: "2026-01-03T00:00:00Z",
      percentPerDay: 10,
      capPercent: 15,
    });
    expect(result.deducted).toBe(1.5);
    expect(result.score).toBe(8.5);
  });
});

describe("farm and engineering math", () => {
  it("keeps margin empty until every load has a price", () => {
    const result = fieldEconomics({
      acres: 10,
      expenseCents: 20000,
      loads: [
        { quantity: 100, salePriceCents: 500 },
        { quantity: 40, salePriceCents: null },
      ],
    });
    expect(result.yieldPerAcre).toBe(14);
    expect(result.marginCents).toBeNull();
    expect(result.missingPriceLoads).toBe(1);
    const priced = fieldEconomics({
      acres: 10,
      expenseCents: 20000,
      loads: [{ quantity: 100, salePriceCents: 500 }],
    });
    expect(priced.marginCents).toBe(30000);
  });

  it("derives field status and re-entry from stored dates", () => {
    expect(fieldStatus({ override: "planned", hasPlanting: true, hasHarvest: true, expectedHarvest: "2026-01-01", today: "2026-06-01" })).toBe("planned");
    expect(fieldStatus({ override: null, hasPlanting: true, hasHarvest: false, expectedHarvest: "2026-01-01", today: "2026-06-01" })).toBe("overdue");
    expect(fieldStatus({ override: null, hasPlanting: false, hasHarvest: false, expectedHarvest: null, today: "2026-06-01" })).toBe("planned");
    expect(reiUntil("2026-01-01", 48)).toBe("2026-01-03T00:00:00.000Z");
    expect(reiUntil("2026-01-01", null)).toBeNull();
  });

  it("estimates acres from a ring", () => {
    const acres = polygonAcres([
      [0, 0],
      [0.001, 0],
      [0.001, 0.001],
      [0, 0.001],
      [0, 0],
    ]);
    expect(acres).toBeGreaterThan(1);
    expect(acres).toBeLessThan(5);
  });

  it("counts milestone progress and the longest dependency path", () => {
    expect(milestoneProgress([]).label).toBe("No issues linked");
    expect(milestoneProgress(["completed", "started", "completed"]).label).toBe("2 of 3");
    const path = criticalPath(
      [
        { id: "a", days: 3 },
        { id: "b", days: 5 },
        { id: "c", days: 2 },
      ],
      [
        { from: "a", to: "c" },
        { from: "b", to: "c" },
      ],
    );
    expect(path.days).toBe(7);
    expect(path.path).toEqual(["b", "c"]);
    expect(dependencyViolations(
      [
        { id: "a", start: "2026-01-01", end: "2026-01-10" },
        { id: "b", start: "2026-01-05", end: "2026-01-12" },
      ],
      [{ from: "a", to: "b" }],
    )).toHaveLength(1);
  });
});

describe("student and practice math", () => {
  it("reports the share of weight that has a grade", () => {
    const grade = recordedCourseGrade([
      { weight: 60, earned: 90, possible: 100, status: "graded" },
      { weight: 40, earned: null, possible: 100, status: "not_started" },
    ]);
    expect(grade.percent).toBe(90);
    expect(grade.weightCovered).toBe(60);
  });

  it("weights GPA by credits and ignores ungraded courses", () => {
    const value = gpa(
      [
        { credits: 3, percent: 92, include: true },
        { credits: 4, percent: 85, include: true },
        { credits: 1, percent: null, include: true },
        { credits: 2, percent: 100, include: false },
      ],
      [
        { min: 90, points: 4 },
        { min: 80, points: 3 },
      ],
    );
    expect(value).toBe(3.43);
  });

  it("ignores an open study session and an unconfirmed long one", () => {
    expect(studyMinutes("2026-01-01T00:00:00Z", null, false)).toBeNull();
    expect(studyMinutes("2026-01-01T00:00:00Z", "2026-01-01T00:45:00Z", false)).toBe(45);
    expect(studyMinutes("2026-01-01T00:00:00Z", "2026-01-01T06:00:00Z", false)).toBeNull();
    expect(studyMinutes("2026-01-01T00:00:00Z", "2026-01-01T06:00:00Z", true)).toBe(360);
  });

  it("bills only when a rate is stored", () => {
    expect(billableAmount(90, 10000)).toBe(15000);
    expect(billableAmount(90, null)).toBeNull();
  });
});

describe("authenticator secrets", () => {
  it("generates a code for every sample owner", () => {
    for (const secret of Object.values(demoMfa)) expect(currentTotp(secret)).toMatch(/^\d{6}$/);
  });
});
