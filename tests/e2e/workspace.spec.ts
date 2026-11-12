import { expect, test } from "@playwright/test";
import { demoMfa, demoPassword, ids } from "../../db/ids";
import { currentTotp } from "../../lib/totp";

async function signIn(page: import("@playwright/test").Page, email: string, secret?: string) {
  await page.context().clearCookies();
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(demoPassword);
  await page.getByRole("button", { name: "Sign in" }).click();
  if (secret) {
    await page.getByLabel("Authentication code").fill(currentTotp(secret));
    await page.getByRole("button", { name: "Confirm code" }).click();
  }
  await page.waitForURL(/\/o\//);
}

test("the marketing page shows the logo and the Codyza link", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("link", { name: "FieldWorks" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Powered by Codyza" })).toBeVisible();
  await expect(page.getByRole("heading", { name: /workspace changes with the work/i })).toBeVisible();
});

test("a wrong password stays on the sign-in page", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill("jordan.hale@northline.test");
  await page.getByLabel("Password").fill("not-the-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByText("Email or password is incorrect.")).toBeVisible();
  await expect(page).toHaveURL(/\/login/);
});

test("forgot password does not reveal whether the email exists", async ({ page }) => {
  await page.goto("/forgot");
  await page.getByLabel("Email").fill("nobody@fieldworks.test");
  await page.getByRole("button", { name: "Send reset link" }).click();
  await expect(page.getByRole("status")).toContainText(/If an account exists/i);
  await page.goto("/forgot");
  await page.getByLabel("Email").fill("june.okoye@northline.test");
  await page.getByRole("button", { name: "Send reset link" }).click();
  await expect(page.getByRole("status")).toContainText(/If an account exists/i);
});

test("a farm viewer cannot see expenses and an advisor can recommend", async ({ page }) => {
  await signIn(page, "jordan.hale@northline.test");
  await expect(page).toHaveURL(/\/o\/northline-acres/);
  await expect(page.getByRole("heading", { name: "Expenses" })).toHaveCount(0);
  await page.getByRole("link", { name: "North Field" }).click();
  await expect(page.getByRole("heading", { name: "Expenses" })).toHaveCount(0);
  await page.getByRole("button", { name: "Log out" }).click();
  await expect(page).toHaveURL(/\/login/);
  await signIn(page, "lee.ortiz@northline.test");
  await page.getByRole("link", { name: "North Field" }).click();
  await expect(page.getByRole("heading", { name: "Expenses" })).toHaveCount(0);
  await page.getByLabel("Recommendation").fill("Scout the north edge before the next rain.");
  await page.getByRole("button", { name: "Write a recommendation" }).click();
  await expect(page.getByText("Scout the north edge before the next rain.")).toBeVisible();
});

test("a farm owner sees stored yield and a missing sale price", async ({ page }) => {
  await signIn(page, "june.okoye@northline.test", demoMfa.june);
  await expect(page).toHaveURL(/\/o\/northline-acres/);
  await expect(page.getByText("Sample organization")).toBeVisible();
  await expect(page.getByText(/load has no sale price/i)).toBeVisible();
  await page.getByRole("link", { name: "Charts" }).click();
  await expect(page.getByText("Yield by field")).toBeVisible();
  await expect(page.getByText("North Field")).toBeVisible();
  await page.getByRole("button", { name: "Log out" }).click();
  await expect(page).toHaveURL(/\/login/);
  await page.goto("/o/northline-acres");
  await expect(page).toHaveURL(/\/login/);
});

test("a student cannot open a classmate submission or the gradebook", async ({ page }) => {
  await signIn(page, "alex.morgan@westfield.test");
  await page.goto(`/o/westfield/submissions/${ids.samQuiz}`);
  await expect(page.getByRole("heading", { name: "This page is not available." })).toBeVisible();
  await page.goto("/o/westfield/sections/" + ids.biology + "/gradebook");
  await expect(page.getByRole("heading", { name: "This page is not available." })).toBeVisible();
  await page.goto(`/o/westfield/assignments/${ids.lab}`);
  await page.getByLabel("Your work").fill(`Lab notes ${Date.now()}`);
  await page.getByRole("button", { name: "Submit" }).click();
  await expect(page.getByText(/timestamp comes from the server|Submission saved/i)).toBeVisible();
});

test("a teacher sees an empty class and a real completion count", async ({ page }) => {
  await signIn(page, "maria.santos@westfield.test");
  await page.goto(`/o/westfield/sections/${ids.openPeriod}/analytics`);
  await expect(page.getByText("No posted grades for this section.", { exact: true })).toBeVisible();
  await page.goto(`/o/westfield/sections/${ids.biology}/analytics`);
  await expect(page.getByText("Essay: 1 of 2")).toBeVisible();
});

test("a student workspace shows a partial weight", async ({ page }) => {
  await signIn(page, "jordan.study@fieldworks.test", demoMfa.jordan);
  await expect(page.getByText(/based on 60% of the weight you have recorded/i)).toBeVisible();
});

test("replaying a field note keeps one row", async ({ page }) => {
  await signIn(page, "sam.okonkwo@northline.test");
  const key = `e2e-${Date.now()}`;
  const body = {
    slug: "northline-acres",
    fieldId: ids.northField,
    kind: "observation",
    notes: "Stand looks even",
    completedOn: "2026-11-11",
    idempotencyKey: key,
  };
  const first = await page.request.post("/api/sync", { data: body });
  const firstBody = await first.text();
  const second = await page.request.post("/api/sync", { data: body });
  const secondBody = await second.text();
  expect(first.status(), firstBody).toBe(200);
  expect(second.status(), secondBody).toBe(200);
  expect(JSON.parse(firstBody).id).toBe(JSON.parse(secondBody).id);
  expect(JSON.parse(secondBody).replayed).toBe(true);
});

test("a new farm workspace has no chart series", async ({ page }) => {
  const email = `new.farmer.${Date.now()}@fieldworks.test`;
  await page.goto("/start");
  await page.getByLabel("Your name").fill("New Farmer");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(demoPassword);
  await page.getByLabel("Workspace name").fill(`Acre ${Date.now()}`);
  await page.getByLabel("Workspace kind").selectOption("farmer");
  await page.getByRole("button", { name: "Create workspace" }).click();
  await expect(page).toHaveURL(/\/mfa/);
  await page.getByRole("button", { name: "Create authenticator secret" }).click();
  const secret = await page.getByRole("status").innerText();
  await page.getByLabel("Authentication code").fill(currentTotp(secret.trim()));
  await page.getByRole("button", { name: "Confirm code" }).click();
  await expect(page.getByText("No fields yet")).toBeVisible();
  await page.getByRole("link", { name: "Charts" }).click();
  await expect(page.getByText("No expenses recorded for this range.")).toBeVisible();
  await expect(page.getByText("No harvest loads recorded.")).toHaveCount(2);
});

test("health checks answer and cron without a secret does not", async ({ request }) => {
  expect((await request.get("/api/health/live")).ok()).toBe(true);
  expect((await request.get("/api/health/ready")).ok()).toBe(true);
  expect((await request.post("/api/cron")).status()).toBe(401);
});

test("phone width keeps sign-in and the workspace usable @mobile", async ({ page }) => {
  await signIn(page, "jordan.hale@northline.test");
  await page.getByRole("button", { name: "Menu" }).click();
  await expect(page.getByRole("link", { name: "Fields" })).toBeVisible();
  await page.getByRole("link", { name: "Map" }).click();
  await expect(page.getByRole("heading", { name: "Field map" })).toBeVisible();
});
