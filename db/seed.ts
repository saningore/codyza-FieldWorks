import { readFileSync } from "node:fs";
import postgres from "postgres";
import { demoMfa, demoPassword, ids } from "./ids";
import { hashPassword } from "../lib/password";

function loadEnv() {
  const text = readFileSync(new URL("../.env", import.meta.url), "utf8");
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match && !process.env[match[1].trim()]) process.env[match[1].trim()] = match[2].trim();
  }
}

loadEnv();

const sql = postgres(process.env.DATABASE_URL_ADMIN!, {
  max: 1,
  onnotice: () => {},
  connection: { search_path: "public,extensions,app" },
});

const people = [
  [ids.june, "june.okoye@northline.test", "June Okoye", demoMfa.june],
  [ids.samOperator, "sam.okonkwo@northline.test", "Sam Okonkwo", null],
  [ids.lee, "lee.ortiz@northline.test", "Lee Ortiz", null],
  [ids.jordanViewer, "jordan.hale@northline.test", "Jordan Hale", null],
  [ids.andre, "andre.brooks@harbor.test", "Andre Brooks", demoMfa.andre],
  [ids.pat, "pat.nguyen@harbor.test", "Pat Nguyen", null],
  [ids.riley, "riley.chen@westfield.test", "Riley Chen", demoMfa.riley],
  [ids.maria, "maria.santos@westfield.test", "Maria Santos", null],
  [ids.alex, "alex.morgan@westfield.test", "Alex Morgan", null],
  [ids.samStudent, "sam.student@westfield.test", "Sam Student", null],
  [ids.jordanStudy, "jordan.study@fieldworks.test", "Jordan Hale", demoMfa.jordan],
  [ids.ada, "ada.okoye@studio.test", "Ada Okoye", demoMfa.ada],
] as const;

async function seed() {
try {
  const passwordHash = await hashPassword(demoPassword);
  await sql`select set_config('app.seed_clock', 'on', false)`;
  for (const [id, email, name, secret] of people) {
    await sql`
      insert into users (id, email, name, password_hash, mfa_secret, mfa_enabled)
      values (${id}, ${email}, ${name}, ${passwordHash}, ${secret}, ${secret != null})
    `;
  }
  const orgs = [
    [ids.farmOrg, "Northline Acres", "northline-acres", "farmer"],
    [ids.engOrg, "Harbor Systems", "harbor-systems", "engineer"],
    [ids.schoolOrg, "Westfield", "westfield", "teacher"],
    [ids.studyOrg, "Jordan Hale", "jordan-study", "student"],
    [ids.practiceOrg, "Okoye Studio", "okoye-studio", "practice"],
  ] as const;
  for (const [id, name, slug, kind] of orgs) {
    await sql`insert into organizations (id, name, slug, kind, demo) values (${id}, ${name}, ${slug}, ${kind}, true)`;
  }
  const members = [
    [ids.farmOrg, ids.june, "owner"],
    [ids.farmOrg, ids.samOperator, "operator"],
    [ids.farmOrg, ids.lee, "advisor"],
    [ids.farmOrg, ids.jordanViewer, "viewer"],
    [ids.engOrg, ids.andre, "owner"],
    [ids.engOrg, ids.pat, "member"],
    [ids.schoolOrg, ids.riley, "owner"],
    [ids.schoolOrg, ids.maria, "teacher"],
    [ids.schoolOrg, ids.alex, "student"],
    [ids.schoolOrg, ids.samStudent, "student"],
    [ids.studyOrg, ids.jordanStudy, "owner"],
    [ids.practiceOrg, ids.ada, "owner"],
  ] as const;
  for (const [org, user, role] of members) {
    await sql`insert into memberships (organization_id, user_id, role) values (${org}, ${user}, ${role})`;
  }

  await sql`insert into farms (id, organization_id, name, notes) values (${ids.farm}, ${ids.farmOrg}, 'Home place', 'The original acreage.')`;
  await sql`
    insert into fields (id, organization_id, farm_id, name, stated_acres, notes, boundary)
    values (
      ${ids.northField}, ${ids.farmOrg}, ${ids.farm}, 'North Field', 40, 'Creek side.',
      st_geomfromtext('POLYGON((-89.010 40.000, -89.000 40.000, -89.000 40.008, -89.010 40.008, -89.010 40.000))', 4326)
    )
  `;
  await sql`
    insert into fields (id, organization_id, farm_id, name, stated_acres, notes, boundary)
    values (
      ${ids.southField}, ${ids.farmOrg}, ${ids.farm}, 'South Field', 55, 'Stated acres differ from the ring.',
      st_geomfromtext('POLYGON((-89.010 39.992, -89.000 39.992, -89.000 40.000, -89.010 40.000, -89.010 39.992))', 4326)
    )
  `;
  await sql`
    insert into crop_seasons (id, organization_id, field_id, crop, planting_on, expected_harvest_on)
    values
      (${ids.northSeason}, ${ids.farmOrg}, ${ids.northField}, 'Corn', current_date - 80, current_date + 40),
      (${ids.southSeason}, ${ids.farmOrg}, ${ids.southField}, 'Soy', current_date - 70, current_date + 50)
  `;
  await sql`
    insert into products (id, organization_id, name, unit, on_hand) values
      (${ids.urea}, ${ids.farmOrg}, 'Urea', 'lb', 100),
      (${ids.herbicide}, ${ids.farmOrg}, 'Glyphosate', 'gal', 20)
  `;
  await sql`
    insert into activities (organization_id, field_id, season_id, kind, status, completed_on, notes, created_by) values
      (${ids.farmOrg}, ${ids.northField}, ${ids.northSeason}, 'planting', 'done', current_date - 80, 'Planted corn.', ${ids.samOperator}),
      (${ids.farmOrg}, ${ids.southField}, ${ids.southSeason}, 'planting', 'done', current_date - 70, 'Planted soy.', ${ids.samOperator})
  `;
  await sql`
    insert into activities (
      organization_id, field_id, season_id, kind, status, completed_on, product_id, amount, notes, created_by
    ) values (
      ${ids.farmOrg}, ${ids.northField}, ${ids.northSeason}, 'fertilizer', 'done', current_date - 40,
      ${ids.urea}, 10, 'Side dress.', ${ids.samOperator}
    )
  `;
  await sql`
    insert into activities (
      organization_id, field_id, season_id, kind, status, completed_on, product_id, amount,
      epa_reg, applicator, rei_hours, phi_hours, notes, created_by
    ) values (
      ${ids.farmOrg}, ${ids.northField}, ${ids.northSeason}, 'pesticide', 'done', current_date - 5,
      ${ids.herbicide}, 2, '524-549', 'Sam Okonkwo', 48, 168, 'Burndown on the north edge.', ${ids.samOperator}
    )
  `;
  await sql`
    insert into activities (
      organization_id, field_id, season_id, kind, status, completed_on, quantity, unit, sale_price_cents, notes, created_by
    ) values (
      ${ids.farmOrg}, ${ids.northField}, ${ids.northSeason}, 'harvest', 'done', current_date - 1,
      120, 'bu', 450, 'First load.', ${ids.samOperator}
    )
  `;
  await sql`
    insert into activities (
      organization_id, field_id, season_id, kind, status, completed_on, quantity, unit, notes, created_by
    ) values (
      ${ids.farmOrg}, ${ids.southField}, ${ids.southSeason}, 'harvest', 'done', current_date - 1,
      80, 'bu', 'Sold price not entered.', ${ids.samOperator}
    )
  `;
  await sql`
    insert into activities (organization_id, field_id, season_id, kind, status, target_on, notes, created_by)
    values (${ids.farmOrg}, ${ids.northField}, ${ids.northSeason}, 'irrigation', 'planned', current_date + 3, 'Check the pivot.', ${ids.june})
  `;
  await sql`
    insert into expenses (organization_id, field_id, season_id, spent_on, amount_cents, category, vendor, notes)
    values (${ids.farmOrg}, ${ids.northField}, ${ids.northSeason}, current_date - 20, 25000, 'inputs', 'Co-op', 'Urea invoice')
  `;

  await sql`
    insert into projects (id, organization_id, name, summary, status, start_on, target_on, site_name, site_address, site_lng, site_lat)
    values (
      ${ids.project}, ${ids.engOrg}, 'Intake pump', 'Replace the intake pump and document the choice.',
      'active', current_date - 20, current_date + 40, 'River intake', '400 River Road', -89.02, 40.01
    )
  `;
  await sql`
    insert into milestones (id, organization_id, project_id, name, target_on) values
      (${ids.milestone}, ${ids.engOrg}, ${ids.project}, 'Pump selected', current_date + 10),
      (${ids.emptyMilestone}, ${ids.engOrg}, ${ids.project}, 'Commissioning', current_date + 30)
  `;
  await sql`
    insert into issues (
      id, organization_id, project_id, number, title, description, priority, status, assignee_id,
      deadline, milestone_id, start_on, end_on, created_by
    ) values
      (
        ${ids.issueA}, ${ids.engOrg}, ${ids.project}, 1, 'Specify the pump', 'Compare two vendors.',
        'high', 'completed', ${ids.pat}, current_date - 1, ${ids.milestone}, current_date - 15, current_date - 1, ${ids.andre}
      ),
      (
        ${ids.issueB}, ${ids.engOrg}, ${ids.project}, 2, 'Install the pump', 'Schedule the crane.',
        'urgent', 'started', ${ids.andre}, current_date - 2, ${ids.milestone}, current_date - 10, current_date + 5, ${ids.andre}
      )
  `;
  await sql`insert into counters (organization_id, kind, value) values (${ids.engOrg}, 'issue', 2)`;
  await sql`
    insert into issue_dependencies (organization_id, predecessor_id, successor_id)
    values (${ids.engOrg}, ${ids.issueA}, ${ids.issueB})
  `;
  await sql`
    insert into issue_revisions (organization_id, issue_id, description, author_id) values
      (${ids.engOrg}, ${ids.issueA}, 'Compare two vendors.', ${ids.andre}),
      (${ids.engOrg}, ${ids.issueB}, 'Schedule the crane.', ${ids.andre})
  `;
  await sql`
    insert into decisions (id, organization_id, project_id, title, status, author_id, decided_on)
    values (${ids.decision}, ${ids.engOrg}, ${ids.project}, 'Pump vendor', 'accepted', ${ids.andre}, current_date - 2)
  `;
  await sql`
    insert into decision_revisions (organization_id, decision_id, revision, problem, options, final_decision, reason, author_id)
    values
      (${ids.engOrg}, ${ids.decision}, 1, 'The intake pump is past service.', 'Rebuild or replace.', 'Replace.', 'The housing is cracked.', ${ids.andre}),
      (${ids.engOrg}, ${ids.decision}, 2, 'The intake pump is past service.', 'Rebuild, replace with Vendor A, or replace with Vendor B.', 'Replace with Vendor A.', 'Vendor A meets the head requirement and ships this month.', ${ids.andre})
  `;

  await sql`insert into courses (id, organization_id, name) values ('e1111111-1111-4111-8111-111111111130', ${ids.schoolOrg}, 'Biology')`;
  await sql`
    insert into sections (id, organization_id, course_id, name, term_name, schedule, room, calculation, missing_counts_as_zero)
    values
      (${ids.biology}, ${ids.schoolOrg}, 'e1111111-1111-4111-8111-111111111130', 'Biology 101', 'Fall', 'Mon Wed 09:00', 'Lab 2', 'weighted', false),
      (${ids.openPeriod}, ${ids.schoolOrg}, 'e1111111-1111-4111-8111-111111111130', 'Open period', 'Fall', 'Fri 14:00', 'Room 4', 'total_points', false)
  `;
  await sql`
    insert into categories (id, organization_id, section_id, name, weight) values
      (${ids.essaysCategory}, ${ids.schoolOrg}, ${ids.biology}, 'Essays', 50),
      (${ids.quizzesCategory}, ${ids.schoolOrg}, ${ids.biology}, 'Quizzes', 50)
  `;
  await sql`
    insert into enrollments (organization_id, section_id, user_id, status) values
      (${ids.schoolOrg}, ${ids.biology}, ${ids.alex}, 'active'),
      (${ids.schoolOrg}, ${ids.biology}, ${ids.samStudent}, 'active'),
      (${ids.schoolOrg}, ${ids.openPeriod}, ${ids.alex}, 'active')
  `;
  await sql`
    insert into assignments (id, organization_id, section_id, category_id, title, points, due_at, published)
    values
      (${ids.essay}, ${ids.schoolOrg}, ${ids.biology}, ${ids.essaysCategory}, 'Essay', 20, now() - interval '10 days', true),
      (${ids.quiz}, ${ids.schoolOrg}, ${ids.biology}, ${ids.quizzesCategory}, 'Quiz', 10, now() - interval '3 days', true),
      (${ids.lab}, ${ids.schoolOrg}, ${ids.biology}, ${ids.quizzesCategory}, 'Lab report', 10, now() + interval '7 days', true)
  `;
  await sql`
    insert into submissions (id, organization_id, assignment_id, user_id, attempt, body, submitted_at) values
      (${ids.alexEssay}, ${ids.schoolOrg}, ${ids.essay}, ${ids.alex}, 1, 'Alex essay draft', now() - interval '11 days'),
      (${ids.alexQuiz}, ${ids.schoolOrg}, ${ids.quiz}, ${ids.alex}, 1, 'Alex quiz answers', now() - interval '1 day'),
      (${ids.samQuiz}, ${ids.schoolOrg}, ${ids.quiz}, ${ids.samStudent}, 1, 'Sam private quiz', now() - interval '4 days')
  `;
  await sql`
    insert into grades (organization_id, submission_id, score, feedback, grader_id, posted_at, excused) values
      (${ids.schoolOrg}, ${ids.alexEssay}, 18, 'Clear thesis.', ${ids.maria}, now() - interval '2 days', false),
      (${ids.schoolOrg}, ${ids.alexQuiz}, 8, 'Late by a day.', ${ids.maria}, now() - interval '1 day', false),
      (${ids.schoolOrg}, ${ids.samQuiz}, 0, 'Excused absence.', ${ids.maria}, now() - interval '1 day', true)
  `;
  for (let day = 6; day >= 1; day -= 1) {
    const session = await sql<{ id: string }[]>`
      insert into attendance_sessions (organization_id, section_id, meeting_on, opened_by)
      values (${ids.schoolOrg}, ${ids.biology}, current_date - (${day}::int), ${ids.maria})
      returning id
    `;
    await sql`
      insert into attendance_marks (organization_id, session_id, user_id, status) values
        (${ids.schoolOrg}, ${session[0].id}, ${ids.alex}, ${day === 2 ? "tardy" : "present"}),
        (${ids.schoolOrg}, ${session[0].id}, ${ids.samStudent}, ${day === 4 ? "absent" : "present"})
    `;
  }
  await sql`
    insert into announcements (organization_id, section_id, body, author_id)
    values (${ids.schoolOrg}, ${ids.biology}, 'Bring the lab notebook on Friday.', ${ids.maria})
  `;

  await sql`
    insert into study_terms (id, organization_id, name, starts_on, ends_on)
    values (${ids.term}, ${ids.studyOrg}, 'Fall', current_date - 60, current_date + 40)
  `;
  await sql`
    insert into study_courses (id, organization_id, term_id, name, instructor, credits, include_in_gpa, room) values
      (${ids.calculus}, ${ids.studyOrg}, ${ids.term}, 'Calculus', 'Dr. Okonkwo', 4, true, 'Hall 12'),
      (${ids.writing}, ${ids.studyOrg}, ${ids.term}, 'Writing', 'Dr. Alvarez', 3, true, 'Hall 4')
  `;
  await sql`
    insert into study_assessments (organization_id, course_id, kind, title, weight, points_possible, points_earned, status, due_at)
    values
      (${ids.studyOrg}, ${ids.calculus}, 'exam', 'Midterm', 60, 100, 90, 'graded', now() - interval '5 days'),
      (${ids.studyOrg}, ${ids.calculus}, 'exam', 'Final', 40, 100, null, 'not_started', now() + interval '20 days')
  `;
  await sql`
    insert into study_meetings (organization_id, course_id, weekday, start_time, end_time)
    values (${ids.studyOrg}, ${ids.calculus}, 1, '09:00', '10:15')
  `;
  await sql`
    insert into study_sessions (organization_id, course_id, started_at, ended_at, method, confirmed)
    values (${ids.studyOrg}, ${ids.calculus}, now() - interval '2 hours', now() - interval '75 minutes', 'practice', false)
  `;

  await sql`insert into clients (id, organization_id, name, notes) values (${ids.client}, ${ids.practiceOrg}, 'River Civic', 'Municipal client.')`;
  await sql`
    insert into sites (id, organization_id, client_id, name, address, lng, lat)
    values (${ids.site}, ${ids.practiceOrg}, ${ids.client}, 'Civic yard', '12 Main Street', -89.03, 40.02)
  `;
  await sql`
    insert into engagements (id, organization_id, client_id, name, status, rate_cents)
    values (${ids.engagement}, ${ids.practiceOrg}, ${ids.client}, 'Yard survey', 'active', null)
  `;
  await sql`
    insert into work_logs (organization_id, engagement_id, started_at, ended_at, billable, notes) values
      (${ids.practiceOrg}, ${ids.engagement}, now() - interval '5 hours', now() - interval '3 hours', true, 'Measured the yard.'),
      (${ids.practiceOrg}, ${ids.engagement}, now() - interval '2 hours', now() - interval '1 hour', true, 'Wrote the note.')
  `;

  console.log("Seed complete.");
} finally {
  await sql.end();
}
}

seed().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
