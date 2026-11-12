import postgres from "postgres";
import { afterAll, expect, it } from "vitest";
import { ids } from "@/db/ids";

const app = postgres(process.env.DATABASE_URL!, { max: 4, connection: { search_path: "public,app" } });
const admin = postgres(process.env.DATABASE_URL_ADMIN!, { max: 1 });

afterAll(async () => {
  await app.end();
  await admin.end();
});

async function asUser<T>(userId: string, orgId: string, fn: (tx: postgres.TransactionSql) => Promise<T>) {
  return app.begin(async (tx) => {
    await tx`select set_config('app.user_id', ${userId}, true)`;
    await tx`select set_config('app.org_id', ${orgId}, true)`;
    return fn(tx);
  });
}

it("hides another organization's fields", async () => {
  const rows = await asUser(ids.alex, ids.farmOrg, (tx) => tx`select id from fields`);
  expect(rows).toHaveLength(0);
});

it("lets a student read only their own submissions and posted grades", async () => {
  const submissions = await asUser(ids.alex, ids.schoolOrg, (tx) => tx<{ user_id: string }[]>`select user_id from submissions`);
  expect(submissions.length).toBeGreaterThan(0);
  expect(submissions.every((row) => row.user_id === ids.alex)).toBe(true);
  const grades = await asUser(ids.alex, ids.schoolOrg, (tx) => tx<{ submission_id: string }[]>`select submission_id from grades`);
  const own = new Set([ids.alexEssay, ids.alexQuiz]);
  expect(grades.every((row) => own.has(row.submission_id as typeof ids.alexEssay))).toBe(true);
  expect(grades.some((row) => row.submission_id === ids.samQuiz)).toBe(false);
});

it("returns class work for the signed-in student only", async () => {
  const rows = await asUser(ids.alex, ids.studyOrg, (tx) => tx<{ assignment_title: string; score: string | null }[]>`
    select assignment_title, score from app.my_class_work()
  `);
  expect(rows.map((row) => row.assignment_title).sort()).toEqual(["Essay", "Lab report", "Quiz"]);
  expect(rows.find((row) => row.assignment_title === "Quiz")?.score).toBe("8");
});

it("hides expenses from an advisor", async () => {
  const rows = await asUser(ids.lee, ids.farmOrg, (tx) => tx`select id from expenses`);
  expect(rows).toHaveLength(0);
  const fields = await asUser(ids.lee, ids.farmOrg, (tx) => tx`select id from fields`);
  expect(fields.length).toBe(2);
});

it("stamps submitted_at with the database clock", async () => {
  const inserted = await asUser(ids.alex, ids.schoolOrg, (tx) => tx<{ submitted_at: Date }[]>`
    insert into submissions (organization_id, assignment_id, user_id, attempt, body, submitted_at)
    values (${ids.schoolOrg}, ${ids.lab}, ${ids.alex}, 1, 'clock check', '2000-01-01T00:00:00Z')
    returning submitted_at
  `);
  expect(inserted[0].submitted_at.getUTCFullYear()).toBeGreaterThan(2000);
});

it("rejects a dependency cycle and a second copy of the same field note", async () => {
  const issueIds = ["d1111111-1111-4111-8111-111111111201", "d1111111-1111-4111-8111-111111111202", "d1111111-1111-4111-8111-111111111203"];
  await asUser(ids.andre, ids.engOrg, async (tx) => {
    for (const [index, id] of issueIds.entries()) {
      await tx`
        insert into issues (id, organization_id, project_id, number, title, description, created_by)
        values (${id}, ${ids.engOrg}, ${ids.project}, ${100 + index}, ${`Cycle ${index}`}, '', ${ids.andre})
      `;
    }
    await tx`
      insert into issue_dependencies (organization_id, predecessor_id, successor_id) values
        (${ids.engOrg}, ${issueIds[0]}, ${issueIds[1]}),
        (${ids.engOrg}, ${issueIds[1]}, ${issueIds[2]})
    `;
  });
  await expect(asUser(ids.andre, ids.engOrg, (tx) => tx`
    insert into issue_dependencies (organization_id, predecessor_id, successor_id)
    values (${ids.engOrg}, ${issueIds[2]}, ${issueIds[0]})
  `)).rejects.toThrow(/dependency cycle/i);

  const key = `integration-${Date.now()}`;
  await asUser(ids.samOperator, ids.farmOrg, (tx) => tx`
    insert into activities (organization_id, field_id, kind, status, completed_on, notes, created_by, idempotency_key)
    values (${ids.farmOrg}, ${ids.northField}, 'observation', 'done', current_date, 'Stand check', ${ids.samOperator}, ${key})
  `);
  await expect(asUser(ids.samOperator, ids.farmOrg, (tx) => tx`
    insert into activities (organization_id, field_id, kind, status, completed_on, notes, created_by, idempotency_key)
    values (${ids.farmOrg}, ${ids.northField}, 'observation', 'done', current_date, 'Stand check', ${ids.samOperator}, ${key})
  `)).rejects.toThrow(/duplicate|unique/i);
});

it("stops two applications from driving stock below zero", async () => {
  const product = "c1111111-1111-4111-8111-111111111199";
  await admin`
    insert into products (id, organization_id, name, unit, on_hand)
    values (${product}, ${ids.farmOrg}, 'Test jug', 'gal', 5)
  `;
  const apply = () => asUser(ids.samOperator, ids.farmOrg, (tx) => tx`
    insert into activities (organization_id, field_id, kind, status, product_id, amount, completed_on, created_by)
    values (${ids.farmOrg}, ${ids.northField}, 'fertilizer', 'done', ${product}, 5, current_date, ${ids.samOperator})
  `);
  const results = await Promise.allSettled([apply(), apply()]);
  expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
  expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
  const left = await admin<{ on_hand: string }[]>`select on_hand from products where id = ${product}`;
  expect(Number(left[0].on_hand)).toBe(0);
});

it("counts login attempts in the database", async () => {
  const email = `rate-${Date.now()}@fieldworks.test`;
  let total = 0;
  for (let attempt = 0; attempt < 11; attempt += 1) {
    const rows = await app<{ note_login_attempt: number }[]>`select app.note_login_attempt(${email}) as note_login_attempt`;
    total = Number(rows[0].note_login_attempt);
  }
  expect(total).toBeGreaterThan(10);
});
