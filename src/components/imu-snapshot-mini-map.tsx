"use client";

import { useEffect, useRef } from "react";
import "leaflet/dist/leaflet.css";
import { cn } from "@/lib/utils";
import { ImuMapNorthBadge } from "@/components/imu-map-north-badge";

/**
 * A Snapshot's stretch of trail, as a small fixed map (by request,
 * 2026-09-10): the reference session's track dimmed as context and the
 * ground between the gates at full strength. No interaction at all — it is a picture of
 * where the Snapshot is, not a map to explore; the session's map is a link
 * away. Same imagery and the same dark treatment as the session map, so
 * the two read as one surface.
 */
export function ImuSnapshotMiniMap({
  track,
  section,
  className,
}: {
  /** The whole track, [lat, lon]. */
  track: [number, number][];
  /** The ground between the gates, entry first. */
  section: [number, number][];
  className?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || section.length < 2) return;
    let cancelled = false;
    let map: import("leaflet").Map | null = null;
    (async () => {
      const L = await import("leaflet");
      if (cancelled || !containerRef.current) return;
      map = L.map(container, {
        attributionControl: false,
        zoomControl: false,
        dragging: false,
        scrollWheelZoom: false,
        doubleClickZoom: false,
        touchZoom: false,
        boxZoom: false,
        keyboard: false,
        zoomSnap: 0,
        // This map never imports leaflet-rotate, but the session's map
        // does, and the plugin patches the global L: reached from that
        // page without a reload, a map made here would grow the plugin's
        // rotate control (seen 2026-09-10). Off explicitly.
        rotateControl: false,
      });
      L.tileLayer(
        "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
        { maxZoom: 20, maxNativeZoom: 19 },
      ).addTo(map);
      map.getPane("tilePane")!.style.filter = "brightness(0.62) saturate(0.65)";
      L.polyline(track, {
        color: "#43F3AF",
        weight: 3,
        opacity: 0.3,
        interactive: false,
      }).addTo(map);
      L.polyline(section, {
        color: "#43F3AF",
        weight: 5,
        opacity: 1,
        interactive: false,
      }).addTo(map);
      // No marker at the entry (removed by request, 2026-09-10): the bright
      // stretch against the dimmed track already says where it starts, and
      // the cursor's halo read as a cursor on a map that has none.
      map.fitBounds(L.latLngBounds(section), { padding: [22, 22] });
    })();
    return () => {
      cancelled = true;
      map?.remove();
      map = null;
    };
  }, [track, section]);

  return (
    <div className={cn("imu-map relative overflow-hidden", className)}>
      <div ref={containerRef} className="absolute inset-0" />
      {/* North-up, so the arrow points up — the session map's own badge,
          so the two maps read as one (by request, 2026-09-10). Above the
          panes, which Leaflet stacks up to 1000. */}
      <ImuMapNorthBadge className="z-[1100]" />
      {/* The imagery's credit, kept even on a picture this small. */}
      <span className="pointer-events-none absolute right-1.5 bottom-0.5 text-[9px] text-white/60">
        © Esri
      </span>
    </div>
  );
}
