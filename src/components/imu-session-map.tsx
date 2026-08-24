"use client";

import "leaflet/dist/leaflet.css";
import { useEffect, useRef, useState } from "react";
import { ArrowUp, Crosshair, Minus, Plus } from "lucide-react";
import type {
  CircleMarker,
  LatLngBounds,
  LayerGroup,
  Map as LeafletMap,
  Path,
} from "leaflet";
import { cn } from "@/lib/utils";
import type { GpsChannels, ImuEvent } from "@/lib/imu/format";
import { gpsPositionAt } from "@/lib/imu/derive";

/**
 * The compass bearing of the ride's overall direction — first fix to last,
 * degrees clockwise from north. Equirectangular: at track scale the
 * projection error is noise.
 */
function trackBearingDeg(gps: GpsChannels): number {
  const m = gps.tMs.length;
  const midLat =
    (((gps.latDeg[0] + gps.latDeg[m - 1]) / 2) * Math.PI) / 180;
  const dx = (gps.lonDeg[m - 1] - gps.lonDeg[0]) * Math.cos(midLat);
  const dy = gps.latDeg[m - 1] - gps.latDeg[0];
  return (Math.atan2(dx, dy) * (180 / Math.PI) + 360) % 360;
}

/** A stretch of track: positions plus each point's ground speed, so the
 * painter can colour by pace when asked to. */
interface TrackPts {
  pts: [number, number][];
  speeds: number[];
}

/** The whole recording as track points. */
function fullTrack(gps: GpsChannels): TrackPts {
  const pts: [number, number][] = [];
  const speeds: number[] = [];
  for (let i = 0; i < gps.tMs.length; i++) {
    pts.push([gps.latDeg[i], gps.lonDeg[i]]);
    speeds.push(gps.speedMps[i]);
  }
  return { pts, speeds };
}

/**
 * The stretch of track inside [fromMs, toMs], with both ends interpolated
 * to the exact instants — the full-strength slice the map paints over the
 * dimmed whole, mirroring the chart's visible window. The interpolated
 * ends borrow the boundary fix's speed: at 10 Hz the difference is not a
 * paintable colour.
 */
function trackSlice(gps: GpsChannels, fromMs: number, toMs: number): TrackPts {
  const pts: [number, number][] = [];
  const speeds: number[] = [];
  const start = gpsPositionAt(gps, fromMs);
  if (start) {
    pts.push([start.latDeg, start.lonDeg]);
    speeds.push(gps.speedMps[nearestFixIndex(gps, fromMs)]);
  }
  for (let i = 0; i < gps.tMs.length; i++) {
    if (gps.tMs[i] > fromMs && gps.tMs[i] < toMs) {
      pts.push([gps.latDeg[i], gps.lonDeg[i]]);
      speeds.push(gps.speedMps[i]);
    }
  }
  const end = gpsPositionAt(gps, toMs);
  if (end) {
    pts.push([end.latDeg, end.lonDeg]);
    speeds.push(gps.speedMps[nearestFixIndex(gps, toMs)]);
  }
  return { pts, speeds };
}

/** Index of the fix nearest an instant — linear scan; 300 fixes need no
 * index, and this only runs at slice edges. */
function nearestFixIndex(gps: GpsChannels, ms: number): number {
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < gps.tMs.length; i++) {
    const d = Math.abs(gps.tMs[i] - ms);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

/** The session's pace distribution: every fix's speed, sorted. Per
 * session, like every gauge in the lab: two recordings are not on the same
 * scale. */
function speedDistribution(gps: GpsChannels): number[] {
  return [...gps.speedMps].sort((a, b) => a - b);
}

/** Where a speed sits in the session's own distribution, 0..1 — its
 * percentile, by binary search over the sorted speeds. */
function paceT(sorted: number[], v: number): number {
  let lo = 0;
  let hi = sorted.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (sorted[mid] <= v) lo = mid + 1;
    else hi = mid;
  }
  return sorted.length > 0 ? lo / sorted.length : 0.5;
}

/**
 * Draws a stretch of track into a layer group. Plain mint when `pace` is
 * null; with the distribution, one short polyline per pair of fixes,
 * coloured red for the session's slowest through to green for its fastest.
 * A Leaflet polyline cannot carry a gradient along itself, so the gradient
 * is the segments; round caps close the joints.
 *
 * Coloured by PERCENTILE, not by a linear min→max map: a ride spends most
 * of its time near cruising speed, so the linear map squeezed almost every
 * segment into the green end and the track read as one colour. Rank
 * spreads the whole palette over the time actually ridden — every colour
 * appears, and section boundaries pop. The trade, accepted: the colour
 * says "faster or slower than the rest of this ride", not how many m/s
 * apart two stretches are — which is the honest reading for a per-session
 * scale anyway.
 *
 * The scale is its own vocabulary, deliberately not the health palette:
 * hsl hue 0→130 runs red through amber to green, which is what "slow to
 * fast" reads as without a legend.
 */
function paintTrack(
  L: typeof import("leaflet"),
  layer: LayerGroup,
  track: TrackPts,
  pace: number[] | null,
  opacity: number,
  weight: number,
) {
  layer.clearLayers();
  const { pts, speeds } = track;
  if (pts.length < 2) return;
  if (!pace) {
    L.polyline(pts, {
      color: "#43F3AF",
      weight,
      opacity,
      interactive: false,
    }).addTo(layer);
    return;
  }
  for (let i = 0; i < pts.length - 1; i++) {
    const t = paceT(pace, (speeds[i] + speeds[i + 1]) / 2);
    L.polyline([pts[i], pts[i + 1]], {
      color: `hsl(${Math.round(t * 130)} 80% 45%)`,
      weight,
      opacity,
      lineCap: "round",
      interactive: false,
    }).addTo(layer);
  }
}

/** The finish marker: a checkered disc in a white ring, drawn as inline SVG
 * for a divIcon — the start is a plain mint dot and the needle a black one,
 * so the finish is the only mark that needs to say "finish" by itself. */
const FINISH_ICON_SIZE = 18;
const FINISH_ICON_SVG = (() => {
  const S = FINISH_ICON_SIZE;
  const cell = S / 4;
  // The ring is centred on the radius, so pulling the radius in by half the
  // stroke keeps the whole mark inside the box.
  const r = (S - 1.5) / 2;
  let cells = "";
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 4; j++) {
      if ((i + j) % 2 === 0)
        cells += `<rect x="${i * cell}" y="${j * cell}" width="${cell}" height="${cell}" fill="#1c1c1c"/>`;
    }
  }
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}" viewBox="0 0 ${S} ${S}">` +
    `<defs><clipPath id="imu-finish-clip"><circle cx="${S / 2}" cy="${S / 2}" r="${r}"/></clipPath></defs>` +
    `<g clip-path="url(#imu-finish-clip)"><rect width="${S}" height="${S}" fill="#ffffff"/>${cells}</g>` +
    `<circle cx="${S / 2}" cy="${S / 2}" r="${r}" fill="none" stroke="#ffffff" stroke-width="1.5"/></svg>`
  );
})();

/**
 * The session's route on a satellite map, synchronized with the chart's
 * cursor in both directions: the needle rides the track as the cursor
 * scrubs, and a press on the map seeks the cursor to the nearest fix.
 *
 * Leaflet plus leaflet-rotate, loaded dynamically inside the effect — the
 * libraries only ever run in the browser, and only on the lab route that
 * renders this, so the rest of the app does not carry a byte of them. Esri
 * World Imagery tiles: satellite, no key, attribution required.
 *
 * **The map is turned so the ride reads top to bottom** — start at the top,
 * finish at the bottom, whatever compass direction the ride ran. North goes
 * wherever that puts it, so a badge shows where it went: its arrow's angle
 * is measured off the rotated map by projecting a due-north step, which
 * holds whatever sign convention the plugin uses.
 *
 * The route is drawn in the lab's mint — the colour the chart already gives
 * to airtime. Three fixed marks: a small mint dot at the start, a checkered
 * disc at the finish, and a black dot as the cursor's needle. Point events
 * mark the track (impacts red, airtime mint, the chart's lane colours);
 * ranged events stay in the chart, where duration has an axis to be read
 * against.
 */
export function ImuSessionMap({
  gps,
  events,
  windowMs,
  speedOn,
  cursorMs,
  onSeek,
  className,
}: {
  gps: GpsChannels;
  /** Already filtered by the page's event switches — the filter rule holds
   * everywhere, the map included. */
  events: ImuEvent[];
  /** The chart's visible window. The track inside it paints at full
   * strength; the rest stays dimmed context, so the map always says which
   * stretch of ground the chart is showing. */
  windowMs: [number, number];
  /** True while the chart's Velocidade series is on — the track trades its
   * mint for the speed gradient, slowest red to fastest green. */
  speedOn: boolean;
  cursorMs: number | null;
  onSeek: (ms: number) => void;
  className?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const needleRef = useRef<CircleMarker | null>(null);
  const eventLayerRef = useRef<LayerGroup | null>(null);
  /** The dimmed whole-track context, repainted when the colour mode flips. */
  const baseTrackRef = useRef<LayerGroup | null>(null);
  /** The full-strength stretch mirroring the chart's window — repainted as
   * the zoom moves and when the colour mode flips. */
  const sliceTrackRef = useRef<LayerGroup | null>(null);
  /** The start dot — ref'd only so restacking can raise it. */
  const startRef = useRef<CircleMarker | null>(null);
  /** The whole route's bounds — what the crosshair reframes to. */
  const boundsRef = useRef<LatLngBounds | null>(null);

  /**
   * Re-imposes the paint order after any repaint. Every vector shares one
   * SVG, where order is insertion order — so a repainted slice lands on
   * top of the marks that were drawn before it, and the dots read as run
   * over by the line. Raising each tier in back-to-front sequence puts the
   * world back: slice above the dimmed track, marks above the slice, the
   * needle above everything. (The finish disc lives in the marker pane, a
   * level above all vectors, and needs no help.)
   */
  const restack = () => {
    const raise = (l: unknown) => (l as Path).bringToFront?.();
    sliceTrackRef.current?.eachLayer(raise);
    eventLayerRef.current?.eachLayer(raise);
    if (startRef.current) raise(startRef.current);
    const map = mapRef.current;
    const needle = needleRef.current;
    if (map && needle && map.hasLayer(needle)) raise(needle);
  };
  /** The latest seek callback, read at click time — the map is built once
   * and must not be torn down because a parent render remade the closure. */
  const onSeekRef = useRef(onSeek);
  useEffect(() => {
    onSeekRef.current = onSeek;
  }, [onSeek]);
  /** Flips when the async init lands — the needle and marker effects run on
   * mount, before the map exists, and need a reason to run again. */
  const [ready, setReady] = useState(false);
  /** Where north points on the rotated map, degrees clockwise from screen-up
   * — the badge arrow's rotation. Null until the map exists. */
  const [northDeg, setNorthDeg] = useState<number | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let cancelled = false;
    let observer: ResizeObserver | null = null;
    let removeWheel: (() => void) | null = null;

    (async () => {
      const L = await import("leaflet");
      // Patches Leaflet in place with rotation support; must land before
      // the map is constructed.
      await import("leaflet-rotate");
      if (cancelled || !containerRef.current) return;

      const map = L.map(containerRef.current, {
        // The page keeps its scroll wheel; the map zooms by control,
        // double click and pinch — including the trackpad pinch, handled
        // below the way the chart handles it.
        scrollWheelZoom: false,
        // Fractional zoom, so the trackpad pinch glides instead of
        // snapping a whole level per tick. The +/− capsule still steps.
        zoomSnap: 0,
        attributionControl: true,
        // Leaflet's own control is off — the capsule overlaid in the JSX
        // below replaces it, drawn in the app's vocabulary instead of the
        // library's stylesheet.
        zoomControl: false,
        // Turned so the ride runs down the screen: the bearing is the
        // compass direction that points up, and pointing the ride's
        // reverse up is what puts the start at the top. Fixed framing —
        // the user gestures that would re-rotate it stay off.
        rotate: true,
        bearing: (trackBearingDeg(gps) + 180) % 360,
        touchRotate: false,
        shiftKeyRotate: false,
        rotateControl: false,
      });
      L.tileLayer(
        "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
        {
          // Esri's imagery stops at 19; the three extra levels upscale
          // those tiles (maxNativeZoom), trading sharpness for the room to
          // read one stretch of trail up close.
          maxZoom: 22,
          maxNativeZoom: 19,
          attribution:
            "&copy; Esri &mdash; Maxar, Earthstar Geographics",
        },
      ).addTo(map);

      // The imagery in a dark treatment — dimmed and desaturated, so the
      // map reads as a dark surface and the track's mint, the gradient and
      // the marks carry all the colour. On the tile pane and not the
      // container: everything drawn over it keeps full strength. The same
      // in both app themes, like every mark on the satellite. Set here
      // rather than as a Tailwind arbitrary variant, which the build
      // failed to generate for a Leaflet-owned class.
      map.getPane("tilePane")!.style.filter =
        "brightness(0.62) saturate(0.65)";

      const track: [number, number][] = [];
      for (let i = 0; i < gps.tMs.length; i++) {
        track.push([gps.latDeg[i], gps.lonDeg[i]]);
      }
      // The track is two layer groups: the dimmed whole as permanent
      // context, and the chart's visible window painted over it at full
      // strength. Both are filled by the paint effects below, which also
      // own the colour mode — mint, or the speed gradient.
      baseTrackRef.current = L.layerGroup().addTo(map);
      sliceTrackRef.current = L.layerGroup().addTo(map);
      // Seed a view before fitting: on a rotated map, fitBounds projects
      // through the current view, and without one leaflet-rotate throws
      // "Set map center and zoom first".
      map.setView(track[Math.floor(track.length / 2)], 15);
      boundsRef.current = L.latLngBounds(track);
      map.fitBounds(boundsRef.current, { padding: [24, 24] });

      // Start and finish, fixed for the session: a small mint dot where the
      // recording began, the checkered disc where it ended. Not interactive
      // — a press on either is a press on the map, which is a seek.
      startRef.current = L.circleMarker(track[0], {
        radius: 6,
        stroke: false,
        fillColor: "#43F3AF",
        fillOpacity: 1,
        interactive: false,
      }).addTo(map);
      L.marker(track[track.length - 1], {
        icon: L.divIcon({
          html: FINISH_ICON_SVG,
          className: "",
          iconSize: [FINISH_ICON_SIZE, FINISH_ICON_SIZE],
          iconAnchor: [FINISH_ICON_SIZE / 2, FINISH_ICON_SIZE / 2],
        }),
        interactive: false,
        keyboard: false,
      }).addTo(map);

      // Marker layers live in a group of their own so the filter effect can
      // rebuild them without touching the route or the needle.
      eventLayerRef.current = L.layerGroup().addTo(map);

      // The needle: a plain black dot, added last so it paints above the
      // event marks.
      needleRef.current = L.circleMarker(track[0], {
        radius: 7,
        stroke: false,
        fillColor: "#1c1c1c",
        fillOpacity: 1,
        interactive: false,
      });

      // Where north landed after the turn, measured rather than assumed:
      // project a due-north step and read its screen angle. Whatever sign
      // convention the plugin uses, the arrow follows the map it drew.
      const p0 = map.latLngToContainerPoint(track[0]);
      const p1 = map.latLngToContainerPoint([
        track[0][0] + 0.001,
        track[0][1],
      ]);
      setNorthDeg(
        (Math.atan2(p1.x - p0.x, p0.y - p1.y) * 180) / Math.PI,
      );

      // A press anywhere on the map is a seek: the nearest fix to the press
      // becomes the cursor's instant. Equirectangular distance — at track
      // scale the projection error is centimetres, and 300 fixes need no
      // spatial index.
      map.on("click", (event) => {
        const { lat, lng } = event.latlng;
        const cosLat = Math.cos((lat * Math.PI) / 180);
        let best = 0;
        let bestD = Infinity;
        for (let i = 0; i < gps.tMs.length; i++) {
          const dLat = gps.latDeg[i] - lat;
          const dLon = (gps.lonDeg[i] - lng) * cosLat;
          const d = dLat * dLat + dLon * dLon;
          if (d < bestD) {
            bestD = d;
            best = i;
          }
        }
        onSeekRef.current(gps.tMs[best]);
      });

      // Trackpad pinch, the chart's arrangement: it arrives as a wheel
      // event with ctrlKey set (Chrome/Edge/Firefox; Safari's gesture
      // events are not handled), zooming around the pointer. A plain
      // vertical wheel is left alone so the page keeps scrolling — that is
      // why scrollWheelZoom is off. Attached natively with passive: false,
      // because preventDefault on a pinch-wheel is what stops the browser
      // zooming the whole page. mouseEventToLatLng goes through the
      // plugin's rotation-aware conversion, so the anchor holds on the
      // turned map.
      const onWheel = (event: WheelEvent) => {
        if (!event.ctrlKey) return;
        event.preventDefault();
        // exp-shaped like the chart's, tuned by feel on the owner's
        // trackpad in three rounds: 0.01/ln2 matched the chart tick for
        // tick and read as barely moving, 0.02 and 0.04 were still shy —
        // a map ranges over far more scale than a 30 s window. 0.055
        // landed right.
        const zoom = Math.min(
          map.getMaxZoom(),
          Math.max(
            map.getMinZoom(),
            map.getZoom() - event.deltaY * (0.055 / Math.LN2),
          ),
        );
        map.setZoomAround(map.mouseEventToLatLng(event), zoom);
      };
      container.addEventListener("wheel", onWheel, { passive: false });
      removeWheel = () => container.removeEventListener("wheel", onWheel);

      // The container changes size with the breakpoint (fixed height on a
      // phone, stretched to the chart's row on desktop) — Leaflet only
      // measures itself on init, so every resize must be reported.
      observer = new ResizeObserver(() => map.invalidateSize());
      observer.observe(container);

      mapRef.current = map;
      setReady(true);
    })();

    return () => {
      cancelled = true;
      observer?.disconnect();
      removeWheel?.();
      needleRef.current = null;
      eventLayerRef.current = null;
      baseTrackRef.current = null;
      sliceTrackRef.current = null;
      startRef.current = null;
      boundsRef.current = null;
      mapRef.current?.remove();
      mapRef.current = null;
      setReady(false);
    };
  }, [gps]);

  // The point events' marks, rebuilt when a filter flips. Ranged events are
  // not marked: a stretch of track says nothing about when it happened, and
  // the chart is where duration reads.
  useEffect(() => {
    const layer = eventLayerRef.current;
    const map = mapRef.current;
    if (!layer || !map) return;
    let cancelled = false;
    (async () => {
      const L = await import("leaflet");
      if (cancelled || !eventLayerRef.current) return;
      layer.clearLayers();
      for (const event of events) {
        const timeMs =
          event.kind === "impact"
            ? event.timeMs
            : event.kind === "jump" || event.kind === "drop"
              ? event.takeoffMs
              : null;
        if (timeMs == null) continue;
        const pos = gpsPositionAt(gps, timeMs);
        if (!pos) continue;
        L.circleMarker([pos.latDeg, pos.lonDeg], {
          radius: 5,
          color: event.kind === "impact" ? "#ffffff" : "#1c1c1c",
          weight: 1,
          fillColor: event.kind === "impact" ? "#F5533D" : "#43F3AF",
          fillOpacity: 1,
        }).addTo(layer);
      }
      restack();
    })();
    return () => {
      cancelled = true;
    };
  }, [events, gps, ready]);

  // The dimmed whole track — repainted only when the colour mode flips.
  useEffect(() => {
    const layer = baseTrackRef.current;
    if (!layer) return;
    let cancelled = false;
    (async () => {
      const L = await import("leaflet");
      if (cancelled || !baseTrackRef.current) return;
      paintTrack(
        L,
        layer,
        fullTrack(gps),
        speedOn ? speedDistribution(gps) : null,
        0.3,
        3,
      );
      restack();
    })();
    return () => {
      cancelled = true;
    };
  }, [speedOn, gps, ready]);

  // The slice follows the chart's zoom: repaint the highlight with the
  // window's stretch. On the whole recording the slice covers the dimmed
  // route entirely, which reads — correctly — as everything being visible.
  useEffect(() => {
    const layer = sliceTrackRef.current;
    if (!layer) return;
    let cancelled = false;
    (async () => {
      const L = await import("leaflet");
      if (cancelled || !sliceTrackRef.current) return;
      // Two points heavier than the dimmed context underneath: opacity
      // separates the two, and the extra width is what still separates
      // them where the slice runs exactly on top of its own dimmed line.
      paintTrack(
        L,
        layer,
        trackSlice(gps, windowMs[0], windowMs[1]),
        speedOn ? speedDistribution(gps) : null,
        1,
        5,
      );
      restack();
    })();
    return () => {
      cancelled = true;
    };
  }, [windowMs, speedOn, gps, ready]);

  // The needle follows the cursor — interpolated between fixes, so at 100
  // IMU samples per 10 fixes it glides rather than steps.
  useEffect(() => {
    const map = mapRef.current;
    const needle = needleRef.current;
    if (!map || !needle) return;
    if (cursorMs == null) {
      needle.remove();
      return;
    }
    const pos = gpsPositionAt(gps, cursorMs);
    if (!pos) return;
    needle.setLatLng([pos.latDeg, pos.lonDeg]);
    if (!map.hasLayer(needle)) needle.addTo(map);
  }, [cursorMs, gps, ready]);

  return (
    // bg-muted while the tiles arrive, so the box reads as a surface and
    // not as a hole in the card. The wrapper owns the box; the map fills it,
    // and the north badge floats over it, unrotated.
    <div className={cn("relative bg-muted", className)}>
      <div
        ref={containerRef}
        aria-label="Percurso da sessão no mapa"
        className="absolute inset-0"
      />
      {/* The map's own controls, in the app's vocabulary instead of the
          library's stylesheet: a white capsule that steps the zoom, and a
          crosshair disc that reframes the whole route — the map's "Repor
          zoom". Fixed colours, like every mark on the satellite. */}
      {ready && (
        <div className="absolute top-2 left-2 z-[1100] flex flex-col items-center gap-1.5">
          <div className="flex flex-col overflow-hidden rounded-full bg-white/90 py-0.5 shadow-sm">
            <button
              type="button"
              aria-label="Aproximar"
              onClick={() => mapRef.current?.zoomIn()}
              className="flex h-8 w-8 cursor-pointer items-center justify-center text-[#1c1c1c] transition-colors hover:bg-black/5"
            >
              <Plus className="size-4" />
            </button>
            <button
              type="button"
              aria-label="Afastar"
              onClick={() => mapRef.current?.zoomOut()}
              className="flex h-8 w-8 cursor-pointer items-center justify-center text-[#1c1c1c] transition-colors hover:bg-black/5"
            >
              <Minus className="size-4" />
            </button>
          </div>
          <button
            type="button"
            aria-label="Enquadrar o percurso"
            onClick={() => {
              const map = mapRef.current;
              const bounds = boundsRef.current;
              if (map && bounds) map.fitBounds(bounds, { padding: [24, 24] });
            }}
            className="flex size-8 cursor-pointer items-center justify-center rounded-full bg-white/90 text-[#1c1c1c] shadow-sm transition-colors hover:bg-white"
          >
            <Crosshair className="size-4" />
          </button>
        </div>
      )}

      {/* Which way north went, since the map no longer promises north-up.
          Fixed colours like the rest of the lab's map marks — the satellite
          under it never changes with the theme. The arrow alone rotates;
          the letter stays upright and readable. */}
      {northDeg != null && (
        <span
          aria-hidden
          className="pointer-events-none absolute top-2 right-2 z-[1100] flex size-7 flex-col items-center justify-center rounded-full bg-white/90 text-[#1c1c1c] shadow-sm"
        >
          <ArrowUp
            className="size-3"
            style={{ transform: `rotate(${northDeg}deg)` }}
          />
          <span className="text-[9px] leading-none font-semibold">N</span>
        </span>
      )}
    </div>
  );
}
