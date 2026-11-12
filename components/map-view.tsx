"use client";

import { useEffect, useState } from "react";

export type MapPoint = { id: string; title: string; subtitle: string; lat: number; lng: number; href: string };

export function MapView({ points, empty }: { points: MapPoint[]; empty: string }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (points.length === 0) return;
    let map: import("maplibre-gl").Map | undefined;
    let alive = true;
    (async () => {
      try {
        const lib = await import("maplibre-gl");
        if (!alive) return;
        lib.setWorkerUrl("/maplibre-gl-worker.mjs");
        map = new lib.Map({
          container: "fw-points",
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
          center: [points[0].lng, points[0].lat],
          zoom: 11,
        });
        map.on("load", () => {
          if (!alive || !map) return;
          const bounds = new lib.LngLatBounds();
          for (const point of points) {
            bounds.extend([point.lng, point.lat]);
            const button = document.createElement("button");
            button.type = "button";
            button.className = "map-pin";
            button.textContent = "Site";
            button.setAttribute("aria-label", point.title);
            const content = document.createElement("div");
            const title = document.createElement("p");
            title.className = "map-popup-title";
            title.textContent = point.title;
            const kind = document.createElement("p");
            kind.className = "map-popup-kind";
            kind.textContent = point.subtitle;
            content.append(title, kind);
            new lib.Marker({ element: button }).setLngLat([point.lng, point.lat]).setPopup(new lib.Popup({ offset: 16 }).setDOMContent(content)).addTo(map);
          }
          if (!bounds.isEmpty()) map.fitBounds(bounds, { padding: 48, maxZoom: 13, duration: 0 });
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
  }, [points]);
  if (points.length === 0) return <p className="card">{empty}</p>;
  return (
    <div className="grid gap-3">
      <div id="fw-points" className="h-80 overflow-hidden rounded-2xl border border-line" />
      {failed ? <p>The map tiles did not load. The list below is still the record.</p> : null}
      <ul className="grid gap-2">
        {points.map((point) => (
          <li key={point.id}><a className="font-bold text-field underline" href={point.href}>{point.title}</a> · {point.subtitle}</li>
        ))}
      </ul>
    </div>
  );
}
