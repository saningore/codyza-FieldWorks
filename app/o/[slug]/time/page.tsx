import { notFound } from "next/navigation";
import { Bars } from "@/components/bars";
import { billableAmount, sumBy } from "@/lib/domain";
import { requireOrg } from "@/server/context";
import { withOrg } from "@/server/db";

export default async function TimePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const org = await requireOrg(slug);
  if (org.kind !== "practice") notFound();
  const data = await withOrg(org.userId, org.orgId, async (tx) => {
    const logs = await tx<{ name: string; started_at: string; ended_at: string; rate_cents: number | null }[]>`
      select e.name, w.started_at::text, w.ended_at::text, e.rate_cents
      from work_logs w
      join engagements e on e.id = w.engagement_id
    `;
    const expenses = org.can("client.write")
      ? await tx<{ spent_on: string; amount_cents: number }[]>`select spent_on::text, amount_cents from practice_expenses`
      : [];
    return { logs, expenses };
  });
  const hours = sumBy(data.logs, (row) => row.name, (row) => (Date.parse(row.ended_at) - Date.parse(row.started_at)) / 3_600_000);
  const expenses = sumBy(data.expenses, (row) => row.spent_on.slice(0, 7), (row) => Number(row.amount_cents));
  const unrated = data.logs.filter((row) => billableAmount(1, row.rate_cents) == null);
  return (
    <div className="grid gap-4">
      <h1 className="font-serif text-4xl">Time</h1>
      {unrated.length > 0 ? <p>Some engagements have no rate, so those hours have no billable amount.</p> : null}
      <Bars title="Hours by engagement" caption="Sum of work log durations." unit="hours" empty="No work logs recorded." rows={hours.map((row) => ({ label: row.label, value: Math.round(row.value * 10) / 10 }))} />
      {org.can("client.write") ? (
        <Bars title="Expenses over time" caption="Sum of practice expenses by month." unit="cents" empty="No expenses recorded for this range." rows={expenses} />
      ) : null}
    </div>
  );
}
