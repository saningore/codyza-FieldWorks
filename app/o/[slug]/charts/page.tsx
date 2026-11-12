import { notFound } from "next/navigation";
import { Bars } from "@/components/bars";
import { sumBy } from "@/lib/domain";
import { requireOrg } from "@/server/context";
import { withOrg } from "@/server/db";

export default async function ChartsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const org = await requireOrg(slug);
  if (org.kind !== "farmer") notFound();
  const data = await withOrg(org.userId, org.orgId, async (tx) => {
    const expenses = org.can("finance.read")
      ? await tx<{ spent_on: string; amount_cents: number }[]>`select spent_on::text, amount_cents from expenses`
      : [];
    const loads = await tx<{ field_name: string; crop: string | null; quantity: string; sale_price_cents: number | null }[]>`
      select f.name as field_name, s.crop, a.quantity, a.sale_price_cents
      from activities a
      join fields f on f.id = a.field_id
      left join crop_seasons s on s.id = a.season_id
      where a.kind = 'harvest' and a.status = 'done'
    `;
    const history = await tx<{ kind: string; completed_on: string }[]>`
      select kind, to_char(completed_on, 'YYYY-MM') as completed_on
      from activities where status = 'done' and completed_on is not null
    `;
    return { expenses, loads, history };
  });
  const missing = data.loads.filter((row) => row.sale_price_cents == null).length;
  return (
    <div className="grid gap-4">
      <h1 className="font-serif text-4xl">Farm charts</h1>
      <p>Each chart is a sum of stored rows. Months with no rows are absent.</p>
      {missing > 0 ? <p>{missing} load has no sale price.</p> : null}
      {org.can("finance.read") ? (
        <Bars
          title="Expenses over time"
          caption="Sum of expense amounts by month."
          unit="cents"
          empty="No expenses recorded for this range."
          rows={sumBy(data.expenses, (row) => row.spent_on.slice(0, 7), (row) => Number(row.amount_cents))}
        />
      ) : <p>Expense charts stay hidden without finance access.</p>}
      <Bars
        title="Yield by field"
        caption="Sum of harvest quantities by field."
        unit="units"
        empty="No harvest loads recorded."
        rows={sumBy(data.loads, (row) => row.field_name, (row) => Number(row.quantity))}
      />
      <Bars
        title="Yield by crop"
        caption="Sum of harvest quantities by crop."
        unit="units"
        empty="No harvest loads recorded."
        rows={sumBy(data.loads, (row) => row.crop ?? "Unassigned crop", (row) => Number(row.quantity))}
      />
      <Bars
        title="Farm activity history"
        caption="Count of completed activities by type and month."
        unit="records"
        empty="No completed activities recorded."
        rows={sumBy(data.history, (row) => `${row.completed_on} ${row.kind}`, () => 1)}
      />
    </div>
  );
}
