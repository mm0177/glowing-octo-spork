"use client";

import { useEffect, useRef, useState } from "react";

export default function MapTest() {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<unknown>(null);
  const [logs, setLogs] = useState<string[]>(["starting..."]);
  const addLog = (msg: string) => {
    console.log("[MapTest]", msg);
    setLogs((l) => [...l, msg]);
  };

  useEffect(() => {
    const el = containerRef.current;
    if (!el) { addLog("ERROR: no container ref"); return; }
    addLog(`Container size: ${el.offsetWidth}x${el.offsetHeight}`);

    // Dynamic import to avoid SSR "window is not defined"
    import("leaflet").then((leafletMod) => {
    const L = leafletMod.default;

    // Fix Leaflet default icon paths (common Next.js issue)
    delete (L.Icon.Default.prototype as unknown as Record<string, unknown>)["_getIconUrl"];
    L.Icon.Default.mergeOptions({
      iconRetinaUrl: "/leaflet-images/marker-icon-2x.png",
      iconUrl: "/leaflet-images/marker-icon.png",
      shadowUrl: "/leaflet-images/marker-shadow.png",
    });

    addLog("Creating L.map...");
    const map = L.map(el, {
      center: [22.5, 82.8],
      zoom: 5,
      preferCanvas: true,
    });
    addLog("Map created ✓");

    // Force size recalc after mount
    setTimeout(() => {
      map.invalidateSize();
      addLog(`invalidateSize — now ${el.offsetWidth}x${el.offsetHeight}`);
    }, 300);

    fetch("/data/india-states.geojson")
      .then((r) => { addLog(`GeoJSON: ${r.status}`); return r.json(); })
      .then((raw: GeoJSON.FeatureCollection) => {
        addLog(`Features: ${raw.features?.length}`);
        const layer = L.geoJSON(raw, {
          style: () => ({ fillColor: "#16a34a", fillOpacity: 0.5, color: "#4ade80", weight: 1 }),
        }).addTo(map);
        map.fitBounds(layer.getBounds(), { padding: [20, 20] });
        addLog("GeoJSON layer added ✓ — India should be green!");
      })
      .catch((err) => addLog(`ERROR: ${err}`));

    mapRef.current = map;
    }); // end dynamic import

    return () => { (mapRef.current as { remove: () => void } | null)?.remove(); };
  }, []);

  return (
    <div style={{ width: "100vw", height: "100vh", display: "flex", flexDirection: "column" }}>
      <h1 style={{ padding: 12, color: "white", background: "#1e293b", margin: 0, flexShrink: 0 }}>
        Leaflet Test Page
      </h1>
      <div style={{ flex: 1, position: "relative" }}>
        <div ref={containerRef} style={{ position: "absolute", inset: 0, background: "#0f172a" }} />
      </div>
      <div style={{
        position: "fixed", bottom: 10, left: 10, zIndex: 9999,
        background: "rgba(0,0,0,0.9)", color: "#4ade80", padding: "10px 14px",
        borderRadius: 8, fontSize: 12, fontFamily: "monospace",
        maxWidth: 500, maxHeight: 250, overflow: "auto", border: "1px solid #166534",
      }}>
        <div style={{ color: "#86efac", fontWeight: "bold", marginBottom: 6 }}>LEAFLET DIAGNOSTIC</div>
        {logs.map((l, i) => <div key={i}>{l}</div>)}
      </div>
    </div>
  );
}
