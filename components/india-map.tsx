"use client";

import { useEffect, useRef, useCallback, useMemo } from "react";
import L from "leaflet";
import type { StateSentiment } from "@/lib/schemas";

/* ── props ── */
interface IndiaMapProps {
  stateSentiments: Record<string, StateSentiment>;
  selectedState: string | null;
  onSelectState: (state: string | null) => void;
  mapboxToken?: string;        // kept for API compat, ignored by Leaflet
  className?: string;
}

/* ── state-name normalisation ── */
const STATE_ALIASES: Record<string, string> = {
  ORISSA: "ODISHA",
  UTTARANCHAL: "UTTARAKHAND",
  "ANDAMAN AND NICOBAR": "ANDAMAN AND NICOBAR ISLANDS",
  PONDICHERRY: "PUDUCHERRY",
  "ANDAMAN & NICOBAR ISLANDS": "ANDAMAN AND NICOBAR ISLANDS",
  "JAMMU & KASHMIR": "JAMMU AND KASHMIR",
  "DADRA AND NAGAR HAVELI": "DADRA AND NAGAR HAVELI AND DAMAN AND DIU",
  "DAMAN AND DIU": "DADRA AND NAGAR HAVELI AND DAMAN AND DIU",
};

function normalise(raw: string): string {
  const upper = raw.toUpperCase().trim().replace(/\s+/g, " ");
  return STATE_ALIASES[upper] ?? upper;
}

/* ── sentiment colours ── */
function sentimentFill(s: StateSentiment): string {
  if (s.score > 0.2) return "#16a34a";
  if (s.score > -0.1) return "#ca8a04";
  return "#dc2626";
}
function sentimentBorder(s: StateSentiment): string {
  if (s.score > 0.2) return "#4ade80";
  if (s.score > -0.1) return "#fbbf24";
  return "#f87171";
}

/* ── component ── */
export function IndiaMap({
  stateSentiments,
  selectedState,
  onSelectState,
  className = "",
}: IndiaMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const geoLayerRef = useRef<L.GeoJSON | null>(null);

  /* keep latest values in refs so the style callback always sees them */
  const sentimentsRef = useRef(stateSentiments);
  sentimentsRef.current = stateSentiments;
  const selectedRef = useRef(selectedState);
  selectedRef.current = selectedState;

  /* ── style function used by L.geoJSON ── */
  const styleFn = useCallback((feature?: GeoJSON.Feature): L.PathOptions => {
    const name = (feature?.properties?.state_name ?? "") as string;
    const sentiments = sentimentsRef.current;
    const selected = selectedRef.current;
    const hasData = Object.keys(sentiments).length > 0;

    /* find matching sentiment entry */
    const entry = Object.entries(sentiments).find(
      ([k]) => normalise(k) === name
    );

    if (!hasData) {
      /* no responses yet — uniform dark state polygons */
      return {
        fillColor: "#1e293b",
        fillOpacity: 0.45,
        color: "#334155",
        weight: 0.5,
      };
    }

    if (entry) {
      const s = entry[1];
      const isSelected = name === selected;
      return {
        fillColor: sentimentFill(s),
        fillOpacity: isSelected ? 0.95 : 0.72,
        color: isSelected ? sentimentBorder(s) : sentimentBorder(s),
        weight: isSelected ? 2.5 : 1.5,
      };
    }

    /* state with no response — dimmed but visible on dark bg */
    return {
      fillColor: "#334155",
      fillOpacity: 0.4,
      color: "#475569",
      weight: 0.5,
    };
  }, []);

  /* ── initialise map once ── */
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    /* Fix Leaflet default icon paths (common Next.js issue) */
    delete (L.Icon.Default.prototype as unknown as Record<string, unknown>)["_getIconUrl"];
    L.Icon.Default.mergeOptions({
      iconRetinaUrl: "/leaflet-images/marker-icon-2x.png",
      iconUrl: "/leaflet-images/marker-icon.png",
      shadowUrl: "/leaflet-images/marker-shadow.png",
    });

    const map = L.map(containerRef.current, {
      center: [22.5, 82.8],
      zoom: 5,
      minZoom: 4,
      maxZoom: 8,
      zoomControl: false,
      attributionControl: false,
      // SVG renderer (default) — each state is a real DOM element with native click events
    });

    /* Force dark background on the Leaflet container itself */
    containerRef.current.style.background = "#0f172a";

    /* zoom control bottom-right */
    L.control.zoom({ position: "bottomright" }).addTo(map);

    /* attribution bottom-left, collapsed */
    L.control.attribution({ position: "bottomleft", prefix: false })
      .addAttribution("Map data © Mapbox")
      .addTo(map);

    mapRef.current = map;
    let aborted = false;

    /* fetch GeoJSON and add layer */
    fetch("/data/india-states.geojson")
      .then((res) => res.json())
      .then((raw: GeoJSON.FeatureCollection) => {
        if (aborted) return;  // component unmounted before fetch resolved
        /* normalise state names into a stable property */
        const geo: GeoJSON.FeatureCollection = {
          ...raw,
          features: raw.features.map((f, i) => ({
            ...f,
            id: i,
            properties: {
              ...f.properties,
              state_name: normalise(
                (f.properties?.NAME_1 ??
                  f.properties?.ST_NM ??
                  f.properties?.state_name ??
                  "") as string
              ),
            },
          })),
        };

        const layer = L.geoJSON(geo, {
          style: styleFn,
          interactive: true,
          onEachFeature: (feature, lyr) => {
            lyr.on("click", (e) => {
              L.DomEvent.stopPropagation(e);   // prevent map drag from consuming click
              const n = (feature.properties?.state_name ?? "") as string;
              onSelectState(n === selectedRef.current ? null : n);
            });
            lyr.on("mouseover", () => {
              map.getContainer().style.cursor = "pointer";
              (lyr as L.Path).setStyle({ fillOpacity: 0.85 });
            });
            lyr.on("mouseout", () => {
              map.getContainer().style.cursor = "";
              layer.resetStyle(lyr);
            });
          },
        }).addTo(map);

        geoLayerRef.current = layer;

        /* fit bounds to India geometry */
        map.fitBounds(layer.getBounds(), { padding: [20, 20] });
      })
      .catch((err) => console.error("[IndiaMap] GeoJSON fetch failed", err));

    /* Ensure map recalculates size after layout settles */
    const timer = setTimeout(() => map.invalidateSize(), 300);
    const ro = new ResizeObserver(() => map.invalidateSize());
    ro.observe(containerRef.current);

    return () => {
      aborted = true;
      clearTimeout(timer);
      ro.disconnect();
      map.remove();
      mapRef.current = null;
      geoLayerRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ── re-style when sentiments / selection change ── */
  const stateKeys = useMemo(
    () => JSON.stringify(Object.keys(stateSentiments).sort()),
    [stateSentiments]
  );
  useEffect(() => {
    const layer = geoLayerRef.current;
    if (!layer) return;
    layer.setStyle(styleFn);
  }, [stateKeys, selectedState, styleFn]);

  return (
    <div className={className} style={{ background: "#0f172a" }}>
      <div ref={containerRef} style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }} />
      {selectedState && (
        <button
          onClick={() => onSelectState(null)}
          className="absolute top-4 right-16 z-1000 bg-slate-900/80 text-slate-200 text-xs px-2.5 py-1 rounded-full border border-slate-700 hover:bg-slate-800 transition"
        >
          Clear: {selectedState}
        </button>
      )}
    </div>
  );
}
