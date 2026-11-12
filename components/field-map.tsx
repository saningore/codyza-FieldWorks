"use client";

import { useEffect, useState } from "react";

export type FieldShape = {
  id: string;
  name: string;
  status: string;
  href: string;
  geojson: string;
};

export function FieldMap({ fields }: { fields: FieldShape[] }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (fields.length === 0) return;
    let map: import("maplibre-gl").Map | undefined;
    let alive = true;
    (async () => {
      try {
        const lib = await import("maplibre-gl");
        if (!alive) return;
        lib.setWorkerUrl("/maplibre-gl-worker.mjs");
        map = new lib.Map({
          container: "fw-fields",
          style: {
            version: 8,
            sources: {
              osm: {
                type: "raster",
                tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
                tileSize: 256,
                attribution: "OpenStreetMap",
              },
            },
            layers: [{ id: "osm", type: "raster", source: "osm" }],
          },
          center: [-89.005, 40.005],
          zoom: 12,
        });
        map.on("load", () => {
          if (!alive || !map) return;
          const features = fields.map((field) => ({
            type: "Feature" as const,
            properties: { id: field.id, name: field.name, href: field.href },
            geometry: JSON.parse(field.geojson) as GeoJSON.Geometry,
          }));
          map.addSource("fields", { type: "geojson", data: { type: "FeatureCollection", features } });
          map.addLayer({ id: "field-fill", type: "fill", source: "fields", paint: { "fill-color": "#2f6f4e", "fill-opacity": 0.45 } });
          map.addLayer({ id: "field-line", type: "line", source: "fields", paint: { "line-color": "#16324f", "line-width": 2 } });
          const bounds = new lib.LngLatBounds();
          for (const feature of features) {
            const geometry = feature.geometry;
            if (geometry.type !== "Polygon") continue;
            for (const ring of geometry.coordinates) for (const pair of ring) bounds.extend(pair as [number, number]);
          }
          if (!bounds.isEmpty()) map.fitBounds(bounds, { padding: 40, duration: 0 });
          map.on("click", "field-fill", (event) => {
            const href = event.features?.[0]?.properties?.href;
            if (typeof href === "string") window.location.href = href;
          });
        });
        map.on("error", () => setFailed(true));
      } catch {
        if (alive) setFailed(true);
      }
    })();
    return () => {
      alive = false;
      map?.remove();
    };
  }, [fields]);
  if (fields.length === 0) return <p className="card">No field boundary has been drawn. Fields without a ring stay in the list.</p>;
  return (
    <div className="grid gap-3">
      <div id="fw-fields" className="h-96 overflow-hidden rounded-2xl border border-line" />
      {failed ? <p>The map tiles did not load. Open a field from the list.</p> : null}
    </div>
  );
}
