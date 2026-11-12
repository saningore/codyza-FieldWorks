import { notFound } from "next/navigation";
import { ActionForm } from "@/components/action-form";
import { SyncNote } from "@/components/sync-note";
import { fieldEconomics, fieldStatus, reiUntil } from "@/lib/domain";
import { formatDay, money } from "@/lib/format";
import { applyCornTemplate, createExpense, logActivity, recommend } from "@/server/work-actions";
import { requireOrg } from "@/server/context";
import { withOrg } from "@/server/db";

export default async function FieldPage({ params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params;
  const org = await requireOrg(slug);
  if (org.kind !== "farmer") notFound();
  const today = new Date().toISOString().slice(0, 10);
  const data = await withOrg(org.userId, org.orgId, async (tx) => {
    const fields = await tx<{
      id: string; name: string; stated_acres: string; computed_acres: string | null; status_override: string | null; notes: string;
      crop: string | null; season_id: string | null; planting_on: string | null; expected_harvest_on: string | null;
    }[]>`
      select f.id, f.name, f.stated_acres, f.computed_acres, f.status_override, f.notes,
        s.crop, s.id as season_id, s.planting_on::text, s.expected_harvest_on::text
      from fields f left join crop_seasons s on s.field_id = f.id
      where f.id = ${id}
    `;
    const activities = await tx<{ id: string; kind: string; status: string; target_on: string | null; completed_on: string | null; notes: string; quantity: string | null; sale_price_cents: number | null; rei_hours: number | null; phi_hours: number | null }[]>`
      select id, kind, status, target_on::text, completed_on::text, notes, quantity, sale_price_cents, rei_hours, phi_hours
      from activities where field_id = ${id} order by coalesce(completed_on, target_on) nulls last
    `;
    const expenses = org.can("finance.read")
      ? await tx<{ spent_on: string; amount_cents: number; category: string; vendor: string }[]>`
          select spent_on::text, amount_cents, category, vendor from expenses where field_id = ${id} order by spent_on
        `
      : [];
    const recommendations = await tx<{ body: string; created_at: string }[]>`
      select body, created_at::text from recommendations where field_id = ${id} order by created_at desc
    `;
    const products = org.can("activity.write")
      ? await tx<{ id: string; name: string; on_hand: string; unit: string }[]>`select id, name, on_hand, unit from products order by name`
      : [];
    return { field: fields[0], activities, expenses, recommendations, products };
  });
  if (!data.field) notFound();
  const field = data.field;
  const status = fieldStatus({
    override: field.status_override,
    hasPlanting: data.activities.some((row) => row.kind === "planting" && row.status === "done"),
    hasHarvest: data.activities.some((row) => row.kind === "harvest" && row.status === "done"),
    expectedHarvest: field.expected_harvest_on,
    today,
  });
  const stated = Number(field.stated_acres);
  const computed = field.computed_acres == null ? null : Number(field.computed_acres);
  const economics = fieldEconomics({
    acres: stated,
    loads: data.activities.filter((row) => row.kind === "harvest" && row.status === "done").map((row) => ({
      quantity: Number(row.quantity ?? 0),
      salePriceCents: row.sale_price_cents,
    })),
    expenseCents: data.expenses.reduce((sum, row) => sum + Number(row.amount_cents), 0),
  });
  return (
    <div className="grid gap-4">
      <div>
        <h1 className="font-serif text-4xl">{field.name}</h1>
        <p>{field.crop ?? "No crop recorded"} · {status}</p>
        <p>Stated acreage {stated}. {computed == null ? "No boundary has been drawn, so there is no computed acreage." : `Computed acreage ${computed} from the boundary.`}</p>
        {computed != null && Math.abs(stated - computed) / stated > 0.05 ? <p>Stated and computed acreage differ by more than 5 percent. Yield uses the stated acreage.</p> : null}
        {field.notes ? <p>{field.notes}</p> : null}
      </div>
      <section className="card">
        <h2 className="font-serif text-2xl">Yield and cost</h2>
        <p>Yield {economics.yieldTotal}{economics.yieldPerAcre != null ? ` · ${economics.yieldPerAcre.toFixed(2)} per stated acre` : ""}.</p>
        {org.can("finance.read") ? <p>Cost {money(economics.costCents)} from stored expenses.</p> : null}
        {economics.marginCents == null ? <p>{economics.missingPriceLoads > 0 ? `${economics.missingPriceLoads} load has no sale price.` : "No harvest load is stored, so there is no margin."}</p> : <p>Margin {money(economics.marginCents)} from priced loads minus expenses.</p>}
      </section>
      <section className="card">
        <h2 className="font-serif text-2xl">Activities</h2>
        {data.activities.length === 0 ? <p>No activities recorded.</p> : (
          <ul className="grid gap-2">
            {data.activities.map((row) => (
              <li key={row.id}>
                {row.kind} · {row.status}
                {row.completed_on ? ` · ${formatDay(row.completed_on, org.timezone)}` : row.target_on ? ` · target ${formatDay(row.target_on, org.timezone)}` : ""}
                {row.quantity ? ` · ${row.quantity}` : ""}
                {row.notes ? ` · ${row.notes}` : ""}
                {row.rei_hours != null ? ` · re-entry until ${reiUntil(row.completed_on, row.rei_hours)}` : ""}
              </li>
            ))}
          </ul>
        )}
      </section>
      {org.can("finance.read") ? (
        <section className="card">
          <h2 className="font-serif text-2xl">Expenses</h2>
          {data.expenses.length === 0 ? <p>No expenses recorded for this field.</p> : (
            <ul>{data.expenses.map((row) => <li key={`${row.spent_on}-${row.category}`}>{formatDay(row.spent_on, org.timezone)} · {row.category} · {money(Number(row.amount_cents))} · {row.vendor}</li>)}</ul>
          )}
          {org.can("finance.write") ? (
            <ActionForm action={createExpense} submitLabel="Add expense">
              <input type="hidden" name="slug" value={slug} />
              <input type="hidden" name="fieldId" value={id} />
              <input type="hidden" name="seasonId" value={field.season_id ?? ""} />
              <label className="field">Date<input name="spent" type="date" required /></label>
              <label className="field">Amount<input name="amount" type="number" min="0" step="0.01" required /></label>
              <label className="field">Category<input name="category" defaultValue="inputs" /></label>
              <label className="field">Vendor<input name="vendor" /></label>
              <label className="field">Notes<textarea name="notes" /></label>
            </ActionForm>
          ) : null}
        </section>
      ) : null}
      <section className="card">
        <h2 className="font-serif text-2xl">Recommendations</h2>
        {data.recommendations.length === 0 ? <p>No recommendations.</p> : <ul>{data.recommendations.map((row) => <li key={row.created_at}>{row.body}</li>)}</ul>}
        {org.can("recommendation.write") ? (
          <ActionForm action={recommend} submitLabel="Write a recommendation">
            <input type="hidden" name="slug" value={slug} />
            <input type="hidden" name="fieldId" value={id} />
            <label className="field">Recommendation<textarea name="body" required /></label>
          </ActionForm>
        ) : null}
      </section>
      {org.can("activity.write") ? (
        <>
          <div className="card">
            <h2 className="font-serif text-2xl">Record work</h2>
            <ActionForm action={logActivity} submitLabel="Record">
              <input type="hidden" name="slug" value={slug} />
              <input type="hidden" name="fieldId" value={id} />
              <input type="hidden" name="seasonId" value={field.season_id ?? ""} />
              <label className="field">Kind
                <select name="kind">
                  {["planting", "irrigation", "fertilizer", "pesticide", "observation", "harvest"].map((kind) => <option key={kind}>{kind}</option>)}
                </select>
              </label>
              <label className="field">Status
                <select name="status" defaultValue="done"><option>planned</option><option>done</option></select>
              </label>
              <label className="field">Target<input name="target" type="date" /></label>
              <label className="field">Completed<input name="completed" type="date" /></label>
              <label className="field">Product
                <select name="productId"><option value="">None</option>{data.products.map((product) => <option key={product.id} value={product.id}>{product.name} ({product.on_hand} {product.unit})</option>)}</select>
              </label>
              <label className="field">Amount applied<input name="amount" type="number" min="0" step="0.01" /></label>
              <label className="field">Harvest quantity<input name="quantity" type="number" min="0" step="0.01" /></label>
              <label className="field">Unit<input name="unit" /></label>
              <label className="field">Sale price per unit<input name="salePrice" type="number" min="0" step="0.01" /></label>
              <label className="field">EPA registration<input name="epa" /></label>
              <label className="field">Applicator<input name="applicator" /></label>
              <label className="field">Re-entry hours<input name="rei" type="number" min="0" /></label>
              <label className="field">Pre-harvest hours<input name="phi" type="number" min="0" /></label>
              <label className="field">Notes<textarea name="notes" /></label>
            </ActionForm>
          </div>
          <div className="card">
            <h2 className="font-serif text-2xl">Apply corn template</h2>
            <p className="text-sm">This writes four planned activities you can edit. It does not invent work that was already done.</p>
            <ActionForm action={applyCornTemplate} submitLabel="Apply template">
              <input type="hidden" name="slug" value={slug} />
              <input type="hidden" name="fieldId" value={id} />
              <input type="hidden" name="seasonId" value={field.season_id ?? ""} />
              <label className="field">Planting date<input name="planting" type="date" required /></label>
            </ActionForm>
          </div>
          <SyncNote slug={slug} fieldId={id} />
        </>
      ) : null}
    </div>
  );
}
