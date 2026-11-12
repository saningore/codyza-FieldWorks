"use server";

import { revalidatePath } from "next/cache";
import { applyLatePenalty } from "@/lib/domain";
import { dbMessage } from "@/lib/format";
import { withOrg, type Tx } from "@/server/db";
import { requireOrg } from "@/server/context";
import type { FormState } from "@/server/forms";

async function note(tx: Tx, orgId: string, actor: string, type: string, id: string | null, summary: string) {
  await tx`
    insert into activity_log (organization_id, actor_id, subject_type, subject_id, summary)
    values (${orgId}, ${actor}, ${type}, ${id}, ${summary})
  `;
}

function text(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

export async function createFarm(_prev: FormState, formData: FormData): Promise<FormState> {
  const org = await requireOrg(text(formData, "slug"));
  if (org.kind !== "farmer" || !org.can("field.write")) return { error: "You cannot add a farm." };
  const name = text(formData, "name");
  if (name.length < 2) return { error: "Name the farm." };
  try {
    await withOrg(org.userId, org.orgId, async (tx) => {
      const rows = await tx<{ id: string }[]>`
        insert into farms (organization_id, name, notes)
        values (${org.orgId}, ${name}, ${text(formData, "notes")})
        returning id
      `;
      await note(tx, org.orgId, org.userId, "farm", rows[0].id, `Added farm ${name}`);
    });
  } catch (error) {
    return { error: dbMessage(error) };
  }
  revalidatePath(`/o/${org.slug}`);
  return { error: "", notice: "Farm saved." };
}

export async function createField(_prev: FormState, formData: FormData): Promise<FormState> {
  const org = await requireOrg(text(formData, "slug"));
  if (!org.can("field.write")) return { error: "You cannot add a field." };
  const name = text(formData, "name");
  const acres = Number(text(formData, "acres"));
  const crop = text(formData, "crop");
  if (name.length < 1 || !(acres > 0) || !crop) return { error: "Enter a name, acreage, and crop." };
  const wkt = text(formData, "wkt");
  try {
    await withOrg(org.userId, org.orgId, async (tx) => {
      const rows = wkt
        ? await tx<{ id: string }[]>`
            insert into fields (organization_id, farm_id, name, stated_acres, notes, boundary)
            values (
              ${org.orgId}, ${text(formData, "farmId")}, ${name}, ${acres}, ${text(formData, "notes")},
              st_geomfromtext(${wkt}, 4326)
            )
            returning id
          `
        : await tx<{ id: string }[]>`
            insert into fields (organization_id, farm_id, name, stated_acres, notes)
            values (${org.orgId}, ${text(formData, "farmId")}, ${name}, ${acres}, ${text(formData, "notes")})
            returning id
          `;
      await tx`
        insert into crop_seasons (organization_id, field_id, crop, planting_on, expected_harvest_on, notes)
        values (
          ${org.orgId}, ${rows[0].id}, ${crop},
          ${text(formData, "planting") || null}, ${text(formData, "harvest") || null}, ''
        )
      `;
      await note(tx, org.orgId, org.userId, "field", rows[0].id, `Added field ${name}`);
    });
  } catch (error) {
    return { error: dbMessage(error) };
  }
  revalidatePath(`/o/${org.slug}/fields`);
  return { error: "", notice: "Field saved." };
}

export async function logActivity(_prev: FormState, formData: FormData): Promise<FormState> {
  const org = await requireOrg(text(formData, "slug"));
  if (!org.can("activity.write")) return { error: "You cannot record field work." };
  const kind = text(formData, "kind");
  const status = text(formData, "status");
  const quantity = text(formData, "quantity");
  const amount = text(formData, "amount");
  const price = text(formData, "salePrice");
  try {
    await withOrg(org.userId, org.orgId, async (tx) => {
      const rows = await tx<{ id: string }[]>`
        insert into activities (
          organization_id, field_id, season_id, kind, status, target_on, completed_on,
          product_id, amount, notes, epa_reg, applicator, rei_hours, phi_hours,
          quantity, unit, sale_price_cents, created_by, idempotency_key
        ) values (
          ${org.orgId}, ${text(formData, "fieldId")}, ${text(formData, "seasonId") || null},
          ${kind}, ${status}, ${text(formData, "target") || null}, ${text(formData, "completed") || null},
          ${text(formData, "productId") || null}, ${amount ? Number(amount) : null}, ${text(formData, "notes")},
          ${text(formData, "epa") || null}, ${text(formData, "applicator") || null},
          ${text(formData, "rei") ? Number(text(formData, "rei")) : null},
          ${text(formData, "phi") ? Number(text(formData, "phi")) : null},
          ${quantity ? Number(quantity) : null}, ${text(formData, "unit") || null},
          ${price ? Math.round(Number(price) * 100) : null}, ${org.userId}, ${text(formData, "idempotency") || null}
        )
        returning id
      `;
      await note(tx, org.orgId, org.userId, "activity", rows[0].id, `Recorded ${kind}`);
    });
  } catch (error) {
    return { error: dbMessage(error) };
  }
  revalidatePath(`/o/${org.slug}/fields/${text(formData, "fieldId")}`);
  return { error: "", notice: "Activity saved." };
}

export async function createExpense(_prev: FormState, formData: FormData): Promise<FormState> {
  const org = await requireOrg(text(formData, "slug"));
  if (!org.can("finance.write")) return { error: "You cannot record expenses." };
  const amount = Number(text(formData, "amount"));
  if (!(amount >= 0) || !text(formData, "spent")) return { error: "Enter a date and an amount." };
  try {
    await withOrg(org.userId, org.orgId, async (tx) => {
      await tx`
        insert into expenses (organization_id, field_id, season_id, spent_on, amount_cents, category, vendor, notes)
        values (
          ${org.orgId}, ${text(formData, "fieldId") || null}, ${text(formData, "seasonId") || null},
          ${text(formData, "spent")}, ${Math.round(amount * 100)}, ${text(formData, "category") || "general"},
          ${text(formData, "vendor")}, ${text(formData, "notes")}
        )
      `;
      await note(tx, org.orgId, org.userId, "expense", null, "Recorded an expense");
    });
  } catch (error) {
    return { error: dbMessage(error) };
  }
  revalidatePath(`/o/${org.slug}/charts`);
  return { error: "", notice: "Expense saved." };
}

export async function createProduct(_prev: FormState, formData: FormData): Promise<FormState> {
  const org = await requireOrg(text(formData, "slug"));
  if (!org.can("stock.write")) return { error: "You cannot change inputs." };
  const onHand = Number(text(formData, "onHand"));
  if (!text(formData, "name") || !(onHand >= 0)) return { error: "Enter a product and a quantity on hand." };
  try {
    await withOrg(org.userId, org.orgId, (tx) => tx`
      insert into products (organization_id, name, unit, on_hand)
      values (${org.orgId}, ${text(formData, "name")}, ${text(formData, "unit") || "unit"}, ${onHand})
    `);
  } catch (error) {
    return { error: dbMessage(error) };
  }
  revalidatePath(`/o/${org.slug}/inputs`);
  return { error: "", notice: "Input saved." };
}

export async function recommend(_prev: FormState, formData: FormData): Promise<FormState> {
  const org = await requireOrg(text(formData, "slug"));
  if (!org.can("recommendation.write")) return { error: "You cannot write a recommendation." };
  const body = text(formData, "body");
  if (body.length < 2) return { error: "Write the recommendation." };
  try {
    await withOrg(org.userId, org.orgId, async (tx) => {
      await tx`
        insert into recommendations (organization_id, field_id, author_id, body)
        values (${org.orgId}, ${text(formData, "fieldId")}, ${org.userId}, ${body})
      `;
      await note(tx, org.orgId, org.userId, "recommendation", text(formData, "fieldId"), "Wrote a field recommendation");
    });
  } catch (error) {
    return { error: dbMessage(error) };
  }
  revalidatePath(`/o/${org.slug}/fields/${text(formData, "fieldId")}`);
  return { error: "", notice: "Recommendation saved." };
}

export async function applyCornTemplate(_prev: FormState, formData: FormData): Promise<FormState> {
  const org = await requireOrg(text(formData, "slug"));
  if (!org.can("activity.write")) return { error: "You cannot plan field work." };
  const planting = text(formData, "planting");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(planting)) return { error: "Choose the planting date for this template." };
  const start = Date.parse(`${planting}T00:00:00Z`);
  const steps = [
    { kind: "planting", day: 0, notes: "Plant corn" },
    { kind: "fertilizer", day: 21, notes: "Side dress" },
    { kind: "observation", day: 45, notes: "Scout the stand" },
    { kind: "harvest", day: 120, notes: "Expected harvest" },
  ];
  try {
    await withOrg(org.userId, org.orgId, async (tx) => {
      for (const step of steps) {
        const day = new Date(start + step.day * 86_400_000).toISOString().slice(0, 10);
        await tx`
          insert into activities (organization_id, field_id, season_id, kind, status, target_on, notes, created_by)
          values (
            ${org.orgId}, ${text(formData, "fieldId")}, ${text(formData, "seasonId") || null},
            ${step.kind}, 'planned', ${day}, ${step.notes}, ${org.userId}
          )
        `;
      }
      await note(tx, org.orgId, org.userId, "template", text(formData, "fieldId"), "Applied the corn activity template");
    });
  } catch (error) {
    return { error: dbMessage(error) };
  }
  revalidatePath(`/o/${org.slug}/calendar`);
  return { error: "", notice: "Four planned activities were added. Edit them to match this field." };
}

export async function createProject(_prev: FormState, formData: FormData): Promise<FormState> {
  const org = await requireOrg(text(formData, "slug"));
  if (org.kind !== "engineer" || !org.can("project.write")) return { error: "You cannot add a project." };
  const name = text(formData, "name");
  if (name.length < 2) return { error: "Name the project." };
  try {
    await withOrg(org.userId, org.orgId, async (tx) => {
      const rows = await tx<{ id: string }[]>`
        insert into projects (organization_id, name, summary, start_on, target_on, site_name, site_address, site_lng, site_lat)
        values (
          ${org.orgId}, ${name}, ${text(formData, "summary")},
          ${text(formData, "start") || null}, ${text(formData, "target") || null},
          ${text(formData, "siteName") || null}, ${text(formData, "siteAddress") || null},
          ${text(formData, "lng") ? Number(text(formData, "lng")) : null},
          ${text(formData, "lat") ? Number(text(formData, "lat")) : null}
        )
        returning id
      `;
      await note(tx, org.orgId, org.userId, "project", rows[0].id, `Opened project ${name}`);
    });
  } catch (error) {
    return { error: dbMessage(error) };
  }
  revalidatePath(`/o/${org.slug}/projects`);
  return { error: "", notice: "Project saved." };
}

export async function createIssue(_prev: FormState, formData: FormData): Promise<FormState> {
  const org = await requireOrg(text(formData, "slug"));
  if (!org.can("issue.write")) return { error: "You cannot add an issue." };
  const title = text(formData, "title");
  if (title.length < 2) return { error: "Give the issue a title." };
  try {
    await withOrg(org.userId, org.orgId, async (tx) => {
      const rows = await tx<{ id: string }[]>`
        insert into issues (
          organization_id, project_id, number, title, description, priority, status,
          assignee_id, deadline, milestone_id, start_on, end_on, created_by
        ) values (
          ${org.orgId}, ${text(formData, "projectId")}, app.next_number('issue'), ${title}, ${text(formData, "description")},
          ${text(formData, "priority") || "none"}, ${text(formData, "status") || "unstarted"},
          ${text(formData, "assignee") || null}, ${text(formData, "deadline") || null},
          ${text(formData, "milestone") || null}, ${text(formData, "start") || null}, ${text(formData, "end") || null},
          ${org.userId}
        )
        returning id
      `;
      await tx`
        insert into issue_revisions (organization_id, issue_id, description, author_id)
        values (${org.orgId}, ${rows[0].id}, ${text(formData, "description")}, ${org.userId})
      `;
      await note(tx, org.orgId, org.userId, "issue", rows[0].id, `Opened issue ${title}`);
    });
  } catch (error) {
    return { error: dbMessage(error) };
  }
  revalidatePath(`/o/${org.slug}/projects/${text(formData, "projectId")}`);
  return { error: "", notice: "Issue saved." };
}

export async function updateIssue(_prev: FormState, formData: FormData): Promise<FormState> {
  const org = await requireOrg(text(formData, "slug"));
  if (!org.can("issue.write")) return { error: "You cannot change this issue." };
  const description = text(formData, "description");
  try {
    await withOrg(org.userId, org.orgId, async (tx) => {
      await tx`
        update issues set
          description = ${description},
          priority = ${text(formData, "priority")},
          status = ${text(formData, "status")},
          assignee_id = ${text(formData, "assignee") || null},
          deadline = ${text(formData, "deadline") || null},
          start_on = ${text(formData, "start") || null},
          end_on = ${text(formData, "end") || null}
        where id = ${text(formData, "issueId")}
      `;
      await tx`
        insert into issue_revisions (organization_id, issue_id, description, author_id)
        values (${org.orgId}, ${text(formData, "issueId")}, ${description}, ${org.userId})
      `;
      await note(tx, org.orgId, org.userId, "issue", text(formData, "issueId"), "Updated an issue");
    });
  } catch (error) {
    return { error: dbMessage(error) };
  }
  revalidatePath(`/o/${org.slug}/issues/${text(formData, "issueId")}`);
  return { error: "", notice: "Issue updated. The previous description is kept." };
}

export async function addComment(_prev: FormState, formData: FormData): Promise<FormState> {
  const org = await requireOrg(text(formData, "slug"));
  const body = text(formData, "body");
  if (body.length < 1) return { error: "Write a comment." };
  try {
    await withOrg(org.userId, org.orgId, (tx) => tx`
      insert into comments (organization_id, subject_type, subject_id, author_id, body)
      values (${org.orgId}, ${text(formData, "subjectType")}, ${text(formData, "subjectId")}, ${org.userId}, ${body})
    `);
  } catch (error) {
    return { error: dbMessage(error) };
  }
  revalidatePath(`/o/${org.slug}`);
  return { error: "", notice: "Comment saved." };
}

export async function createMilestone(_prev: FormState, formData: FormData): Promise<FormState> {
  const org = await requireOrg(text(formData, "slug"));
  if (!org.can("project.write")) return { error: "You cannot add a milestone." };
  try {
    await withOrg(org.userId, org.orgId, (tx) => tx`
      insert into milestones (organization_id, project_id, name, target_on)
      values (${org.orgId}, ${text(formData, "projectId")}, ${text(formData, "name")}, ${text(formData, "target") || null})
    `);
  } catch (error) {
    return { error: dbMessage(error) };
  }
  revalidatePath(`/o/${org.slug}/projects/${text(formData, "projectId")}`);
  return { error: "", notice: "Milestone saved." };
}

export async function addDependency(_prev: FormState, formData: FormData): Promise<FormState> {
  const org = await requireOrg(text(formData, "slug"));
  if (!org.can("issue.write")) return { error: "You cannot add a dependency." };
  try {
    await withOrg(org.userId, org.orgId, (tx) => tx`
      insert into issue_dependencies (organization_id, predecessor_id, successor_id)
      values (${org.orgId}, ${text(formData, "predecessor")}, ${text(formData, "successor")})
    `);
  } catch (error) {
    return { error: dbMessage(error) };
  }
  revalidatePath(`/o/${org.slug}/timeline`);
  return { error: "", notice: "Dependency saved." };
}

export async function saveDecision(_prev: FormState, formData: FormData): Promise<FormState> {
  const org = await requireOrg(text(formData, "slug"));
  if (!org.can("decision.write")) return { error: "You cannot record a decision." };
  const title = text(formData, "title");
  if (title.length < 2 || !text(formData, "problem") || !text(formData, "decision")) {
    return { error: "Enter the title, the problem, and the decision." };
  }
  try {
    await withOrg(org.userId, org.orgId, async (tx) => {
      const existing = text(formData, "decisionId");
      let decisionId = existing;
      if (!decisionId) {
        const rows = await tx<{ id: string }[]>`
          insert into decisions (organization_id, project_id, title, status, author_id, decided_on, supersedes_id)
          values (
            ${org.orgId}, ${text(formData, "projectId") || null}, ${title}, ${text(formData, "status") || "proposed"},
            ${org.userId}, ${text(formData, "decided") || null}, ${text(formData, "supersedes") || null}
          )
          returning id
        `;
        decisionId = rows[0].id;
      } else {
        await tx`
          update decisions set title = ${title}, status = ${text(formData, "status")}, decided_on = ${text(formData, "decided") || null}
          where id = ${decisionId}
        `;
      }
      const rev = await tx<{ next: number }[]>`
        select coalesce(max(revision), 0) + 1 as next from decision_revisions where decision_id = ${decisionId}
      `;
      await tx`
        insert into decision_revisions (
          organization_id, decision_id, revision, problem, options, final_decision, reason, author_id
        ) values (
          ${org.orgId}, ${decisionId}, ${rev[0].next}, ${text(formData, "problem")}, ${text(formData, "options")},
          ${text(formData, "decision")}, ${text(formData, "reason")}, ${org.userId}
        )
      `;
      await note(tx, org.orgId, org.userId, "decision", decisionId, `Recorded decision ${title}`);
    });
  } catch (error) {
    return { error: dbMessage(error) };
  }
  revalidatePath(`/o/${org.slug}/decisions`);
  return { error: "", notice: "Decision saved. Earlier revisions stay in the history." };
}

export async function saveDocument(_prev: FormState, formData: FormData): Promise<FormState> {
  const org = await requireOrg(text(formData, "slug"));
  if (!org.can("project.write")) return { error: "You cannot add a document." };
  try {
    await withOrg(org.userId, org.orgId, async (tx) => {
      let documentId = text(formData, "documentId");
      if (!documentId) {
        const rows = await tx<{ id: string }[]>`
          insert into documents (organization_id, project_id, title)
          values (${org.orgId}, ${text(formData, "projectId")}, ${text(formData, "title")})
          returning id
        `;
        documentId = rows[0].id;
      }
      const rev = await tx<{ next: number }[]>`
        select coalesce(max(revision), 0) + 1 as next from document_revisions where document_id = ${documentId}
      `;
      await tx`
        insert into document_revisions (organization_id, document_id, revision, body, author_id)
        values (${org.orgId}, ${documentId}, ${rev[0].next}, ${text(formData, "body")}, ${org.userId})
      `;
    });
  } catch (error) {
    return { error: dbMessage(error) };
  }
  revalidatePath(`/o/${org.slug}/projects/${text(formData, "projectId")}`);
  return { error: "", notice: "Document revision saved." };
}

export async function createCourseSection(_prev: FormState, formData: FormData): Promise<FormState> {
  const org = await requireOrg(text(formData, "slug"));
  if (org.kind !== "teacher" || !org.can("class.write")) return { error: "You cannot add a class." };
  const course = text(formData, "course");
  const section = text(formData, "section");
  if (course.length < 2 || section.length < 2) return { error: "Name the course and the class." };
  try {
    await withOrg(org.userId, org.orgId, async (tx) => {
      const courses = await tx<{ id: string }[]>`
        insert into courses (organization_id, name) values (${org.orgId}, ${course}) returning id
      `;
      const sections = await tx<{ id: string }[]>`
        insert into sections (organization_id, course_id, name, term_name, schedule, room, calculation)
        values (
          ${org.orgId}, ${courses[0].id}, ${section}, ${text(formData, "term")},
          ${text(formData, "schedule")}, ${text(formData, "room")}, ${text(formData, "calculation") || "total_points"}
        )
        returning id
      `;
      await tx`
        insert into categories (organization_id, section_id, name, weight)
        values (${org.orgId}, ${sections[0].id}, 'Coursework', 100)
      `;
      await note(tx, org.orgId, org.userId, "section", sections[0].id, `Opened class ${section}`);
    });
  } catch (error) {
    return { error: dbMessage(error) };
  }
  revalidatePath(`/o/${org.slug}/sections`);
  return { error: "", notice: "Class saved." };
}

export async function createAssignment(_prev: FormState, formData: FormData): Promise<FormState> {
  const org = await requireOrg(text(formData, "slug"));
  if (!org.can("class.write")) return { error: "You cannot add an assignment." };
  const points = Number(text(formData, "points"));
  if (!text(formData, "title") || !(points > 0)) return { error: "Enter a title and points." };
  try {
    await withOrg(org.userId, org.orgId, (tx) => tx`
      insert into assignments (
        organization_id, section_id, category_id, title, points, due_at, published, late_percent_per_day, late_cap_percent
      ) values (
        ${org.orgId}, ${text(formData, "sectionId")}, ${text(formData, "categoryId") || null}, ${text(formData, "title")},
        ${points}, ${text(formData, "due") || null}, ${formData.get("published") === "on"},
        ${Number(text(formData, "latePercent") || 0)}, ${Number(text(formData, "lateCap") || 0)}
      )
    `);
  } catch (error) {
    return { error: dbMessage(error) };
  }
  revalidatePath(`/o/${org.slug}/sections/${text(formData, "sectionId")}`);
  return { error: "", notice: "Assignment saved." };
}

export async function submitWork(_prev: FormState, formData: FormData): Promise<FormState> {
  const org = await requireOrg(text(formData, "slug"));
  if (!org.can("assignment.submit")) return { error: "You cannot submit this assignment." };
  const body = text(formData, "body");
  if (body.length < 1) return { error: "Write the submission." };
  try {
    await withOrg(org.userId, org.orgId, async (tx) => {
      const attempt = await tx<{ next: number }[]>`
        select coalesce(max(attempt), 0) + 1 as next
        from submissions
        where assignment_id = ${text(formData, "assignmentId")} and user_id = ${org.userId}
      `;
      await tx`
        insert into submissions (organization_id, assignment_id, user_id, attempt, body)
        values (${org.orgId}, ${text(formData, "assignmentId")}, ${org.userId}, ${attempt[0].next}, ${body})
      `;
      await note(tx, org.orgId, org.userId, "submission", text(formData, "assignmentId"), "Submitted assignment work");
    });
  } catch (error) {
    return { error: dbMessage(error) };
  }
  revalidatePath(`/o/${org.slug}/assignments/${text(formData, "assignmentId")}`);
  return { error: "", notice: "Submission saved. The timestamp comes from the server." };
}

export async function gradeSubmission(_prev: FormState, formData: FormData): Promise<FormState> {
  const org = await requireOrg(text(formData, "slug"));
  if (!org.can("grade.write")) return { error: "You cannot grade this submission." };
  const raw = Number(text(formData, "score"));
  if (!Number.isFinite(raw) || raw < 0) return { error: "Enter a score." };
  const excused = formData.get("excused") === "on";
  const posted = formData.get("posted") === "on";
  try {
    await withOrg(org.userId, org.orgId, async (tx) => {
      const rows = await tx<{ due_at: string | null; submitted_at: string; points: string; late_percent_per_day: string; late_cap_percent: string }[]>`
        select a.due_at, s.submitted_at, a.points, a.late_percent_per_day, a.late_cap_percent
        from submissions s
        join assignments a on a.id = s.assignment_id
        where s.id = ${text(formData, "submissionId")}
      `;
      const row = rows[0];
      if (!row) throw new Error("submission is missing");
      const penalty = excused
        ? { score: raw, deducted: 0 }
        : applyLatePenalty({
            raw,
            possible: Number(row.points),
            dueAt: row.due_at,
            submittedAt: row.submitted_at,
            percentPerDay: Number(row.late_percent_per_day),
            capPercent: Number(row.late_cap_percent),
          });
      await tx`
        insert into grades (organization_id, submission_id, score, points_deducted, feedback, grader_id, posted_at, excused)
        values (
          ${org.orgId}, ${text(formData, "submissionId")}, ${penalty.score}, ${penalty.deducted},
          ${text(formData, "feedback")}, ${org.userId}, ${posted ? tx`now()` : null}, ${excused}
        )
        on conflict (submission_id) do update set
          score = excluded.score,
          points_deducted = excluded.points_deducted,
          feedback = excluded.feedback,
          grader_id = excluded.grader_id,
          graded_at = now(),
          posted_at = excluded.posted_at,
          excused = excluded.excused
      `;
      await note(tx, org.orgId, org.userId, "grade", text(formData, "submissionId"), posted ? "Posted a grade" : "Saved a grade draft");
    });
  } catch (error) {
    return { error: dbMessage(error) };
  }
  revalidatePath(`/o/${org.slug}/assignments/${text(formData, "assignmentId")}`);
  return { error: "", notice: "Grade saved." };
}

export async function saveAttendance(_prev: FormState, formData: FormData): Promise<FormState> {
  const org = await requireOrg(text(formData, "slug"));
  if (!org.can("attendance.write")) return { error: "You cannot record attendance." };
  const meeting = text(formData, "meeting");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(meeting)) return { error: "Choose the meeting date." };
  try {
    await withOrg(org.userId, org.orgId, async (tx) => {
      const sessions = await tx<{ id: string }[]>`
        insert into attendance_sessions (organization_id, section_id, meeting_on, opened_by)
        values (${org.orgId}, ${text(formData, "sectionId")}, ${meeting}, ${org.userId})
        on conflict (section_id, meeting_on) do update set opened_by = excluded.opened_by
        returning id
      `;
      const roster = await tx<{ user_id: string }[]>`
        select user_id from enrollments
        where section_id = ${text(formData, "sectionId")} and status = 'active'
      `;
      for (const student of roster) {
        const status = text(formData, `mark_${student.user_id}`) || "present";
        await tx`
          insert into attendance_marks (organization_id, session_id, user_id, status)
          values (${org.orgId}, ${sessions[0].id}, ${student.user_id}, ${status})
          on conflict (session_id, user_id) do update set status = excluded.status
        `;
      }
      await note(tx, org.orgId, org.userId, "attendance", sessions[0].id, `Recorded attendance for ${meeting}`);
    });
  } catch (error) {
    return { error: dbMessage(error) };
  }
  revalidatePath(`/o/${org.slug}/sections/${text(formData, "sectionId")}/attendance`);
  return { error: "", notice: "Attendance saved." };
}

export async function announce(_prev: FormState, formData: FormData): Promise<FormState> {
  const org = await requireOrg(text(formData, "slug"));
  if (!org.can("class.write")) return { error: "You cannot post an announcement." };
  if (text(formData, "body").length < 1) return { error: "Write the announcement." };
  try {
    await withOrg(org.userId, org.orgId, (tx) => tx`
      insert into announcements (organization_id, section_id, body, author_id)
      values (${org.orgId}, ${text(formData, "sectionId")}, ${text(formData, "body")}, ${org.userId})
    `);
  } catch (error) {
    return { error: dbMessage(error) };
  }
  revalidatePath(`/o/${org.slug}/sections/${text(formData, "sectionId")}`);
  return { error: "", notice: "Announcement posted." };
}

export async function enrollStudent(_prev: FormState, formData: FormData): Promise<FormState> {
  const org = await requireOrg(text(formData, "slug"));
  if (!org.can("class.write")) return { error: "You cannot change the roster." };
  try {
    await withOrg(org.userId, org.orgId, (tx) => tx`
      insert into enrollments (organization_id, section_id, user_id, status)
      values (${org.orgId}, ${text(formData, "sectionId")}, ${text(formData, "userId")}, 'active')
    `);
  } catch (error) {
    return { error: dbMessage(error) };
  }
  revalidatePath(`/o/${org.slug}/sections/${text(formData, "sectionId")}`);
  return { error: "", notice: "Student enrolled." };
}

export async function createStudyCourse(_prev: FormState, formData: FormData): Promise<FormState> {
  const org = await requireOrg(text(formData, "slug"));
  if (org.kind !== "student" || !org.can("study.write")) return { error: "You cannot add a course." };
  if (text(formData, "name").length < 2) return { error: "Name the course." };
  try {
    await withOrg(org.userId, org.orgId, (tx) => tx`
      insert into study_courses (organization_id, term_id, name, instructor, credits, include_in_gpa, room)
      values (
        ${org.orgId}, ${text(formData, "termId") || null}, ${text(formData, "name")}, ${text(formData, "instructor")},
        ${Number(text(formData, "credits") || 0)}, ${formData.get("include") !== "off"}, ${text(formData, "room")}
      )
    `);
  } catch (error) {
    return { error: dbMessage(error) };
  }
  revalidatePath(`/o/${org.slug}/courses`);
  return { error: "", notice: "Course saved." };
}

export async function createAssessment(_prev: FormState, formData: FormData): Promise<FormState> {
  const org = await requireOrg(text(formData, "slug"));
  if (!org.can("study.write")) return { error: "You cannot add an assessment." };
  const earned = text(formData, "earned");
  try {
    await withOrg(org.userId, org.orgId, (tx) => tx`
      insert into study_assessments (
        organization_id, course_id, kind, title, due_at, weight, points_possible, points_earned, status
      ) values (
        ${org.orgId}, ${text(formData, "courseId")}, ${text(formData, "kind") || "homework"}, ${text(formData, "title")},
        ${text(formData, "due") || null}, ${Number(text(formData, "weight") || 0)}, ${Number(text(formData, "possible") || 100)},
        ${earned === "" ? null : Number(earned)}, ${text(formData, "status") || "not_started"}
      )
    `);
  } catch (error) {
    return { error: dbMessage(error) };
  }
  revalidatePath(`/o/${org.slug}/courses/${text(formData, "courseId")}`);
  return { error: "", notice: "Assessment saved." };
}

export async function logStudy(_prev: FormState, formData: FormData): Promise<FormState> {
  const org = await requireOrg(text(formData, "slug"));
  if (!org.can("study.write")) return { error: "You cannot log study time." };
  const started = text(formData, "started");
  const ended = text(formData, "ended");
  if (!started || !ended) return { error: "Enter a start and an end. A session without an end is not counted." };
  const minutes = (Date.parse(ended) - Date.parse(started)) / 60_000;
  if (!(minutes > 0)) return { error: "The end must be after the start." };
  if (minutes > 240 && formData.get("confirmed") !== "on") {
    return { error: "That session is longer than four hours. Confirm it before it counts." };
  }
  try {
    await withOrg(org.userId, org.orgId, (tx) => tx`
      insert into study_sessions (organization_id, course_id, started_at, ended_at, method, confirmed)
      values (
        ${org.orgId}, ${text(formData, "courseId") || null}, ${started}, ${ended},
        ${text(formData, "method") || "read"}, ${formData.get("confirmed") === "on"}
      )
    `);
  } catch (error) {
    return { error: dbMessage(error) };
  }
  revalidatePath(`/o/${org.slug}/week`);
  return { error: "", notice: "Study session saved." };
}

export async function createPlace(_prev: FormState, formData: FormData): Promise<FormState> {
  const org = await requireOrg(text(formData, "slug"));
  if (!org.can("study.write")) return { error: "You cannot add a place." };
  const lng = Number(text(formData, "lng"));
  const lat = Number(text(formData, "lat"));
  if (!text(formData, "name") || !Number.isFinite(lng) || !Number.isFinite(lat)) return { error: "Enter a name, longitude, and latitude." };
  try {
    await withOrg(org.userId, org.orgId, (tx) => tx`
      insert into study_places (organization_id, name, lng, lat)
      values (${org.orgId}, ${text(formData, "name")}, ${lng}, ${lat})
    `);
  } catch (error) {
    return { error: dbMessage(error) };
  }
  revalidatePath(`/o/${org.slug}/places`);
  return { error: "", notice: "Place saved." };
}

export async function createClient(_prev: FormState, formData: FormData): Promise<FormState> {
  const org = await requireOrg(text(formData, "slug"));
  if (org.kind !== "practice" || !org.can("client.write")) return { error: "You cannot add a client." };
  if (text(formData, "name").length < 2) return { error: "Name the client." };
  try {
    await withOrg(org.userId, org.orgId, async (tx) => {
      const rows = await tx<{ id: string }[]>`
        insert into clients (organization_id, name, notes) values (${org.orgId}, ${text(formData, "name")}, ${text(formData, "notes")})
        returning id
      `;
      if (text(formData, "site")) {
        await tx`
          insert into sites (organization_id, client_id, name, address, lng, lat)
          values (
            ${org.orgId}, ${rows[0].id}, ${text(formData, "site")}, ${text(formData, "address")},
            ${text(formData, "lng") ? Number(text(formData, "lng")) : null},
            ${text(formData, "lat") ? Number(text(formData, "lat")) : null}
          )
        `;
      }
    });
  } catch (error) {
    return { error: dbMessage(error) };
  }
  revalidatePath(`/o/${org.slug}/clients`);
  return { error: "", notice: "Client saved." };
}

export async function createEngagement(_prev: FormState, formData: FormData): Promise<FormState> {
  const org = await requireOrg(text(formData, "slug"));
  if (!org.can("client.write")) return { error: "You cannot add an engagement." };
  const rate = text(formData, "rate");
  try {
    await withOrg(org.userId, org.orgId, (tx) => tx`
      insert into engagements (organization_id, client_id, name, status, rate_cents)
      values (
        ${org.orgId}, ${text(formData, "clientId")}, ${text(formData, "name")}, ${text(formData, "status") || "active"},
        ${rate === "" ? null : Math.round(Number(rate) * 100)}
      )
    `);
  } catch (error) {
    return { error: dbMessage(error) };
  }
  revalidatePath(`/o/${org.slug}/engagements`);
  return { error: "", notice: "Engagement saved." };
}

export async function logWork(_prev: FormState, formData: FormData): Promise<FormState> {
  const org = await requireOrg(text(formData, "slug"));
  if (!org.can("time.write")) return { error: "You cannot log time." };
  try {
    await withOrg(org.userId, org.orgId, (tx) => tx`
      insert into work_logs (organization_id, engagement_id, started_at, ended_at, billable, notes)
      values (
        ${org.orgId}, ${text(formData, "engagementId")}, ${text(formData, "started")}, ${text(formData, "ended")},
        ${formData.get("billable") === "on"}, ${text(formData, "notes")}
      )
    `);
  } catch (error) {
    return { error: dbMessage(error) };
  }
  revalidatePath(`/o/${org.slug}/time`);
  return { error: "", notice: "Time saved." };
}

export async function createStudyTerm(_prev: FormState, formData: FormData): Promise<FormState> {
  const org = await requireOrg(text(formData, "slug"));
  if (!org.can("study.write")) return { error: "You cannot add a term." };
  try {
    await withOrg(org.userId, org.orgId, (tx) => tx`
      insert into study_terms (organization_id, name, starts_on, ends_on)
      values (${org.orgId}, ${text(formData, "name")}, ${text(formData, "starts") || null}, ${text(formData, "ends") || null})
    `);
  } catch (error) {
    return { error: dbMessage(error) };
  }
  revalidatePath(`/o/${org.slug}/courses`);
  return { error: "", notice: "Term saved." };
}
