import Link from "next/link";
import { notFound } from "next/navigation";
import { FieldMap } from "@/components/field-map";
import { fieldStatus } from "@/lib/domain";
import { requireOrg } from "@/server/context";
import { withOrg } from "@/server/db";

export default async function MapPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const org = await requireOrg(slug);
  if (org.kind !== "farmer") notFound();
  const today = new Date().toISOString().slice(0, 10);
  const rows = await withOrg(org.userId, org.orgId, async (tx) => {
    const fields = await tx<{ id: string; name: string; status_override: string | null; expected_harvest_on: string | null; geojson: string | null }[]>`
      select f.id, f.name, f.status_override, s.expected_harvest_on::text, st_asgeojson(f.boundary) as geojson
      from fields f left join crop_seasons s on s.field_id = f.id order by f.name
    `;
    const flags = await tx<{ field_id: string; kind: string }[]>`
      select field_id, kind from activities where status = 'done' and kind in ('planting', 'harvest')
    `;
    return { fields, flags };
  });
  const mapped = rows.fields.filter((field) => field.geojson);
  return (
    <div className="grid gap-4">
      <h1 className="font-serif text-4xl">Field map</h1>
      <FieldMap fields={mapped.map((field) => ({
        id: field.id,
        name: field.name,
        href: `/o/${slug}/fields/${field.id}`,
        geojson: field.geojson as string,
        status: fieldStatus({
          override: field.status_override,
          hasPlanting: rows.flags.some((flag) => flag.field_id === field.id && flag.kind === "planting"),
          hasHarvest: rows.flags.some((flag) => flag.field_id === field.id && flag.kind === "harvest"),
          expectedHarvest: field.expected_harvest_on,
          today,
        }),
      }))} />
      <ul className="grid gap-2">
        {rows.fields.map((field) => (
          <li key={field.id}><Link className="font-bold text-field underline" href={`/o/${slug}/fields/${field.id}`}>{field.name}</Link> · {field.geojson ? "boundary stored" : "no boundary drawn"}</li>
        ))}
      </ul>
    </div>
  );
}
