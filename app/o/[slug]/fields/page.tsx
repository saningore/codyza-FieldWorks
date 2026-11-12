import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm } from "@/components/action-form";
import { fieldStatus } from "@/lib/domain";
import { createFarm, createField } from "@/server/work-actions";
import { requireOrg } from "@/server/context";
import { withOrg } from "@/server/db";

export default async function FieldsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const org = await requireOrg(slug);
  if (org.kind !== "farmer") notFound();
  const today = new Date().toISOString().slice(0, 10);
  const data = await withOrg(org.userId, org.orgId, async (tx) => {
    const farms = await tx<{ id: string; name: string }[]>`select id, name from farms order by name`;
    const fields = await tx<{ id: string; farm_id: string; name: string; stated_acres: string; status_override: string | null; crop: string | null; expected_harvest_on: string | null }[]>`
      select f.id, f.farm_id, f.name, f.stated_acres, f.status_override, s.crop, s.expected_harvest_on::text
      from fields f left join crop_seasons s on s.field_id = f.id order by f.name
    `;
    const flags = await tx<{ field_id: string; kind: string }[]>`
      select field_id, kind from activities where status = 'done' and kind in ('planting', 'harvest')
    `;
    return { farms, fields, flags };
  });
  return (
    <div className="grid gap-4">
      <h1 className="font-serif text-4xl">Fields</h1>
      {data.fields.length === 0 ? <p>No fields yet.</p> : (
        <ul className="grid gap-3">
          {data.fields.map((field) => (
            <li key={field.id} className="card">
              <Link className="font-bold text-field underline" href={`/o/${slug}/fields/${field.id}`}>{field.name}</Link>
              <p>{field.crop ?? "No crop"} · {field.stated_acres} acres · {fieldStatus({
                override: field.status_override,
                hasPlanting: data.flags.some((flag) => flag.field_id === field.id && flag.kind === "planting"),
                hasHarvest: data.flags.some((flag) => flag.field_id === field.id && flag.kind === "harvest"),
                expectedHarvest: field.expected_harvest_on,
                today,
              })}</p>
            </li>
          ))}
        </ul>
      )}
      {org.can("field.write") ? (
        <div className="grid gap-4 md:grid-cols-2">
          <div className="card">
            <h2 className="font-serif text-2xl">Add a farm</h2>
            <ActionForm action={createFarm} submitLabel="Add farm">
              <input type="hidden" name="slug" value={slug} />
              <label className="field">Name<input name="name" required /></label>
              <label className="field">Notes<textarea name="notes" /></label>
            </ActionForm>
          </div>
          {data.farms.length > 0 ? (
            <div className="card">
              <h2 className="font-serif text-2xl">Add a field</h2>
              <ActionForm action={createField} submitLabel="Add field">
                <input type="hidden" name="slug" value={slug} />
                <label className="field">Farm
                  <select name="farmId">{data.farms.map((farm) => <option key={farm.id} value={farm.id}>{farm.name}</option>)}</select>
                </label>
                <label className="field">Field name<input name="name" required /></label>
                <label className="field">Stated acreage<input name="acres" type="number" min="0.1" step="0.1" required /></label>
                <label className="field">Crop<input name="crop" required /></label>
                <label className="field">Planting date<input name="planting" type="date" /></label>
                <label className="field">Expected harvest<input name="harvest" type="date" /></label>
                <label className="field">Boundary WKT<textarea name="wkt" placeholder="POLYGON((lng lat, lng lat, lng lat, lng lat))" /></label>
                <label className="field">Notes<textarea name="notes" /></label>
              </ActionForm>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
