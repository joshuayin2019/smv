"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { MutableRefObject, PointerEvent as ReactPointerEvent, ReactNode } from "react";
import * as maplibregl from "maplibre-gl";
import { ActionIcon, Badge, Box, Collapse, Group, Paper, Stack, Text, Tooltip } from "@mantine/core";
import { useClipboard } from "@mantine/hooks";
import {
  IconCheck,
  IconChevronDown,
  IconCopy,
  IconGripHorizontal,
  IconInfoCircle,
  IconWalk,
} from "@tabler/icons-react";
import { useMapStore } from "@/stores/map_stores";
import { useSmvStore } from "@/stores/smv_stores";
import { ACCENT, BORDER, NAVY, NAVY_DEEP } from "@/lib/theme_colors";
import { ZONALS } from "@/components/pages/smv/map_smv"; // adjust path (same one layer_control uses)

/* ---------------- Config ---------------- */

const EYE_HEIGHT = 1.7; // camera height above the ground, in meters
const WALK_SPEED = 5; // m/s
const RUN_MULT = 3; // while Shift is held
const TURN_SPEED = 70; // deg/s for Q / E / arrow keys
const LOOK_SENSITIVITY = 0.25; // deg per pixel while dragging
const WALK_PITCH = 84; // near-level view (needs maxPitch >= 85, set while walking)
const MIN_PITCH = 60;
const MAX_PITCH = 85;

// View the map returns to after leaving walk mode (a normal, flat map)
const EXIT_ZOOM = 18;
const EXIT_PITCH = 0;

const SMV_SOURCE = "smv"; // same id SmvLayer uses
const BUILDING_LAYER = "3d-buildings";
const ROAD_SEARCH_M = 60; // farther than this -> "no road nearby"
const ROAD_SNAP_M = 8; // within this -> "on the road"

const M_PER_DEG = 111320;

const DRAG_THRESHOLD_PX = 6; // pointer must move this far before a press becomes a drag

const MOVE_KEYS = new Set([
  "w", "a", "s", "d", "q", "e",
  "arrowup", "arrowdown", "arrowleft", "arrowright", "shift",
]);

// Events the map must not see while walking (so clicks / drags / wheel don't pan, zoom or select roads)
const BLOCKED_EVENTS = [
  "mousedown", "mouseup", "mousemove", "click", "dblclick",
  "touchstart", "touchmove", "touchend", "touchcancel", "wheel", "contextmenu",
];

/* ---------------- Types ---------------- */

type Mode = "off" | "placing" | "walking";

type RoadHit = { props: Record<string, any>; dist: number };

type RoadInfo = {
  id: string;
  name: string;
  place: string;
  dist: number;
  onRoad: boolean;
  zonal: { key: string; label: string; color: string; value: number }[];
};

type RoadStatus = "ok" | "none" | "off";

type Info = {
  lat: number;
  lng: number;
  bearing: number;
  pitch: number;
  roadStatus: RoadStatus;
  road: RoadInfo | null;
  buildingHeight: number | null;
};

type Walker = { lng: number; lat: number; bearing: number; pitch: number };

/* ---------------- Helpers ---------------- */

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const normBearing = (b: number) => ((b % 360) + 360) % 360;

const COMPASS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
const compass = (b: number) => COMPASS[Math.round(normBearing(b) / 45) % 8];

const pick = (obj: any, ...keys: string[]) => {
  for (const k of keys) {
    const v = obj?.[k];
    if (v !== null && v !== undefined && v !== "") return String(v);
  }
  return "";
};

function pointToSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number) {
  const dx = bx - ax;
  const dy = by - ay;
  const l2 = dx * dx + dy * dy;
  const t = l2 ? clamp(((px - ax) * dx + (py - ay) * dy) / l2, 0, 1) : 0;
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

// Nearest SMV road (only types that are switched on) to a point, using the tiles already loaded
function nearestRoad(map: maplibregl.Map, lng: number, lat: number): RoadHit | null {
  const enabled = useMapStore.getState().smv.enabled as Record<string, boolean>;
  const feats = map.querySourceFeatures(SMV_SOURCE, { sourceLayer: "smv" });

  const kx = M_PER_DEG * Math.cos((lat * Math.PI) / 180);
  let best: RoadHit | null = null;

  for (const f of feats) {
    const p = (f.properties ?? {}) as Record<string, any>;
    if (!ZONALS.some((z) => enabled[z.key] && Number(p[z.key]) > 0)) continue;

    const g = f.geometry as any;
    const lines: number[][][] | null =
      g?.type === "LineString" ? [g.coordinates] : g?.type === "MultiLineString" ? g.coordinates : null;
    if (!lines) continue;

    for (const line of lines) {
      for (let i = 0; i < line.length - 1; i++) {
        const d = pointToSegment(
          0,
          0,
          (line[i][0] - lng) * kx,
          (line[i][1] - lat) * M_PER_DEG,
          (line[i + 1][0] - lng) * kx,
          (line[i + 1][1] - lat) * M_PER_DEG
        );
        if (!best || d < best.dist) best = { props: p, dist: d };
      }
    }
  }
  return best;
}

// Camera at eye height, looking along bearing / pitch.
// MapLibre v5 has no free camera API, so convert the camera position + altitude + rotation
// into regular center / zoom / bearing / pitch options and jump there.
function applyCamera(map: maplibregl.Map, w: Walker) {
  const opts = map.calculateCameraOptionsFromCameraLngLatAltRotation(
    [w.lng, w.lat],
    EYE_HEIGHT,
    w.bearing,
    w.pitch
  );
  map.jumpTo(opts);
}

/* ---------------- Small UI pieces ---------------- */

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Group justify="space-between" wrap="nowrap" gap={8} align="flex-start">
      <Text fz={11} c="dimmed" style={{ flexShrink: 0 }}>
        {label}
      </Text>
      <Text component="div" fz={12} c={NAVY} fw={500} ta="right">
        {children}
      </Text>
    </Group>
  );
}

function PadKey({
  k,
  label,
  keysRef,
}: {
  k: string;
  label: string;
  keysRef: MutableRefObject<Set<string>>;
}) {
  const release = () => keysRef.current.delete(k);
  return (
    <Box
      onPointerDown={(e) => {
        e.preventDefault();
        keysRef.current.add(k);
      }}
      onPointerUp={release}
      onPointerLeave={release}
      onPointerCancel={release}
      style={{
        width: 46,
        height: 46,
        borderRadius: 8,
        background: "rgba(15, 23, 42, 0.7)",
        color: "#fff",
        fontWeight: 700,
        fontSize: 16,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: "pointer",
        userSelect: "none",
        touchAction: "none",
      }}
    >
      {label}
    </Box>
  );
}

// Banner shown at the top of the map
function Banner({ children }: { children: ReactNode }) {
  return (
    <Box
      style={{
        position: "absolute",
        top: 10,
        left: "50%",
        transform: "translateX(-50%)",
        padding: "4px 10px",
        borderRadius: 6,
        background: "rgba(15, 23, 42, 0.75)",
        color: "#fff",
        fontSize: 12,
        pointerEvents: "none",
        zIndex: 3,
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </Box>
  );
}

/* ---------------- Component ---------------- */

export default function MapWalk() {
  const map = useMapStore((s) => s.map);
  const clipboard = useClipboard({ timeout: 1200 });

  // off -> placing (choose a start point) -> walking
  const [mode, setMode] = useState<Mode>("off");
  const walking = mode === "walking";

  const [panelOpen, setPanelOpen] = useState(true);
  const [info, setInfo] = useState<Info | null>(null);

  const walkingRef = useRef(false);
  const walkerRef = useRef<Walker | null>(null);
  const startRef = useRef<{ lng: number; lat: number } | null>(null);
  const keysRef = useRef(new Set<string>());
  const recCache = useRef<{ id: string; rec: any } | null>(null);

  // floating window position (null = default corner), relative to the map wrapper
  const panelRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const panelDrag = useRef<{ dx: number; dy: number } | null>(null);

  // dragging the walk icon onto the map
  const iconDrag = useRef<{ x: number; y: number; moved: boolean } | null>(null);
  const suppressClick = useRef(false);
  const [ghost, setGhost] = useState<{ x: number; y: number } | null>(null);

  // Begin walking from a chosen point
  const startAt = useCallback((p: { lng: number; lat: number }) => {
    startRef.current = { lng: p.lng, lat: p.lat };
    setMode("walking");
  }, []);

  // Everything the info window shows, for the walker's current position
  const compute = useCallback((): Info | null => {
    const w = walkerRef.current;
    if (!map || !map.getStyle() || !walkingRef.current || !w) return null;

    const { lng, lat } = w;

    // Road
    let roadStatus: RoadStatus = "ok";
    let road: RoadInfo | null = null;
    const smvState = useMapStore.getState().smv;

    if (!map.getSource(SMV_SOURCE) || !smvState.visible) {
      roadStatus = "off";
    } else {
      const hit = nearestRoad(map, lng, lat);
      if (!hit || hit.dist > ROAD_SEARCH_M) {
        roadStatus = "none";
      } else {
        const id = String(hit.props.id ?? "");
        if (recCache.current?.id !== id) {
          const rec = useSmvStore.getState().smv.find((r) => String(r.id) === id);
          recCache.current = { id, rec };
        }
        const rec = recCache.current?.rec as any;
        // Adjust these field names if your SmvRecord uses different ones
        const name = pick(rec, "street", "name", "road_name") || pick(hit.props, "street", "name", "road_name");
        const place = [
          pick(rec, "barangay") || pick(hit.props, "barangay"),
          pick(rec, "city_municipality") || pick(hit.props, "city_municipality"),
        ]
          .filter(Boolean)
          .join(", ");

        road = {
          id,
          name: name || "Unnamed road",
          place,
          dist: hit.dist,
          onRoad: hit.dist <= ROAD_SNAP_M,
          zonal: ZONALS.map((z) => ({ ...z, value: Number(hit.props[z.key]) || 0 })).filter(
            (z) => z.value > 0 && smvState.enabled[z.key]
          ),
        };
      }
    }

    // Building at the crosshair
    let buildingHeight: number | null = null;
    if (map.getLayer(BUILDING_LAYER)) {
      const canvas = map.getCanvas();
      const pt: [number, number] = [canvas.clientWidth / 2, canvas.clientHeight / 2];
      const bf = map.queryRenderedFeatures(pt, { layers: [BUILDING_LAYER] })[0];
      const h = Number(bf?.properties?.render_height);
      buildingHeight = bf && Number.isFinite(h) ? h : null;
    }

    return {
      lat,
      lng,
      bearing: w.bearing,
      pitch: w.pitch,
      roadStatus,
      road,
      buildingHeight,
    };
  }, [map]);

  // ----- Placing: crosshair cursor, click the map to choose the start point, Esc cancels -----
  useEffect(() => {
    if (!map || mode !== "placing") return;

    const canvas = map.getCanvas();
    const prevCursor = canvas.style.cursor;
    canvas.style.cursor = "crosshair";

    const onClick = (e: maplibregl.MapMouseEvent) => startAt(e.lngLat);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMode("off");
    };

    map.on("click", onClick);
    window.addEventListener("keydown", onKey);
    return () => {
      map.off("click", onClick);
      window.removeEventListener("keydown", onKey);
      canvas.style.cursor = prevCursor;
    };
  }, [map, mode, startAt]);

  // ----- Keyboard while walking (W A S D, Q E, arrows, Shift; Esc leaves walk mode) -----
  useEffect(() => {
    if (!walking) return;

    const isTyping = (t: EventTarget | null) => {
      const el = t as HTMLElement | null;
      return !!el && (["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName) || el.isContentEditable);
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (isTyping(e.target) || e.ctrlKey || e.metaKey || e.altKey) return;
      const key = e.key.toLowerCase();
      if (key === "escape") {
        setMode("off");
        return;
      }
      if (MOVE_KEYS.has(key)) {
        keysRef.current.add(key);
        e.preventDefault();
      }
    };
    const onKeyUp = (e: KeyboardEvent) => keysRef.current.delete(e.key.toLowerCase());
    const onBlur = () => keysRef.current.clear();

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
      keysRef.current.clear();
    };
  }, [walking]);

  // ----- Walk mode: eye-height camera + game loop -----
  useEffect(() => {
    walkingRef.current = walking;
    if (!map || !walking) return;

    // Start where the user placed the walker (fallback: map center)
    const start = startRef.current ?? map.getCenter();
    const w: Walker = { lng: start.lng, lat: start.lat, bearing: map.getBearing(), pitch: WALK_PITCH };
    walkerRef.current = w;

    // Walk mode needs a near-level camera, so raise the pitch limit only while walking
    const prevMaxPitch = map.getMaxPitch();
    map.setMaxPitch(MAX_PITCH);

    const keyboardWasOn = map.keyboard.isEnabled();
    map.keyboard.disable(); // arrows would pan the map

    // Stop the map from seeing mouse / touch / wheel, so only our own look-around runs
    const el = map.getCanvasContainer();
    const stop = (e: Event) => e.stopPropagation();
    BLOCKED_EVENTS.forEach((t) => el.addEventListener(t, stop, true));
    const prevTouchAction = el.style.touchAction;
    el.style.touchAction = "none";

    // Drag to look around
    let drag: { x: number; y: number } | null = null;
    let dirty = true; // camera needs to be re-applied
    let infoDirty = true; // info window needs to be refreshed
    const onDown = (e: PointerEvent) => {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      drag = { x: e.clientX, y: e.clientY };
      el.setPointerCapture(e.pointerId);
    };
    const onPointerMove = (e: PointerEvent) => {
      if (!drag) return;
      w.bearing = normBearing(w.bearing + (e.clientX - drag.x) * LOOK_SENSITIVITY);
      w.pitch = clamp(w.pitch - (e.clientY - drag.y) * LOOK_SENSITIVITY, MIN_PITCH, MAX_PITCH);
      drag = { x: e.clientX, y: e.clientY };
      dirty = true;
    };
    const onUp = (e: PointerEvent) => {
      drag = null;
      if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId);
    };
    el.addEventListener("pointerdown", onDown);
    el.addEventListener("pointermove", onPointerMove);
    el.addEventListener("pointerup", onUp);
    el.addEventListener("pointercancel", onUp);

    let raf = 0;
    let last = performance.now();
    let lastReport = 0;

    const tick = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.1);
      last = now;

      // Something else (e.g. a table row click) started a fly-to: cancel it, we own the camera
      if (map.isMoving()) {
        map.stop();
        dirty = true;
      }

      const k = keysRef.current;
      const fwd = (k.has("w") || k.has("arrowup") ? 1 : 0) - (k.has("s") || k.has("arrowdown") ? 1 : 0);
      const str = (k.has("d") ? 1 : 0) - (k.has("a") ? 1 : 0);
      const turn = (k.has("e") || k.has("arrowright") ? 1 : 0) - (k.has("q") || k.has("arrowleft") ? 1 : 0);

      if (turn) {
        w.bearing = normBearing(w.bearing + turn * TURN_SPEED * dt);
        dirty = true;
      }

      if (fwd || str) {
        const len = Math.hypot(fwd, str); // same speed on diagonals
        const dist = WALK_SPEED * (k.has("shift") ? RUN_MULT : 1) * dt;
        const b = (w.bearing * Math.PI) / 180;
        const east = ((fwd * Math.sin(b) + str * Math.cos(b)) / len) * dist;
        const north = ((fwd * Math.cos(b) - str * Math.sin(b)) / len) * dist;
        w.lat += north / M_PER_DEG;
        w.lng += east / (M_PER_DEG * Math.cos((w.lat * Math.PI) / 180));
        dirty = true;
      }

      if (dirty) {
        applyCamera(map, w);
        dirty = false;
        infoDirty = true;
      }

      // Throttled window refresh (runs after the camera has settled too)
      if (infoDirty && now - lastReport > 200) {
        lastReport = now;
        infoDirty = false;
        setInfo(compute());
      }

      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      BLOCKED_EVENTS.forEach((t) => el.removeEventListener(t, stop, true));
      el.removeEventListener("pointerdown", onDown);
      el.removeEventListener("pointermove", onPointerMove);
      el.removeEventListener("pointerup", onUp);
      el.removeEventListener("pointercancel", onUp);
      el.style.touchAction = prevTouchAction;
      if (keyboardWasOn) map.keyboard.enable();

      walkingRef.current = false;
      const end = walkerRef.current;
      walkerRef.current = null;
      startRef.current = null;
      setInfo(null);

      // Leave walk mode: back to a normal flat map where you were standing.
      // jumpTo first (pitch is within the old limit), then restore the normal max pitch.
      try {
        if (end && map.getStyle()) {
          map.jumpTo({ center: [end.lng, end.lat], zoom: EXIT_ZOOM, pitch: EXIT_PITCH, bearing: end.bearing });
          map.setMaxPitch(prevMaxPitch);
        }
      } catch {
        // map was already removed
      }
    };
  }, [map, walking, compute]);

  // Keep the floating window inside the map if the map was resized since it was last moved
  useEffect(() => {
    if (!walking) return;
    const el = panelRef.current;
    const parent = el?.offsetParent as HTMLElement | null;
    if (!el || !parent) return;
    setPos((p) =>
      p && {
        x: clamp(p.x, 0, Math.max(0, parent.clientWidth - el.offsetWidth)),
        y: clamp(p.y, 0, Math.max(0, parent.clientHeight - el.offsetHeight)),
      }
    );
  }, [walking]);

  /* ----- Floating window: drag by the title bar ----- */

  const onPanelDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest("button")) return; // let the collapse button work
    const el = panelRef.current;
    const parent = el?.offsetParent as HTMLElement | null;
    if (!el || !parent) return;
    const r = el.getBoundingClientRect();
    const pr = parent.getBoundingClientRect();
    panelDrag.current = { dx: e.clientX - r.left, dy: e.clientY - r.top };
    setPos({ x: r.left - pr.left, y: r.top - pr.top }); // switch from bottom-anchored to top/left
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onPanelMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = panelDrag.current;
    const el = panelRef.current;
    const parent = el?.offsetParent as HTMLElement | null;
    if (!d || !el || !parent) return;
    const pr = parent.getBoundingClientRect();
    setPos({
      x: clamp(e.clientX - pr.left - d.dx, 0, Math.max(0, pr.width - el.offsetWidth)),
      y: clamp(e.clientY - pr.top - d.dy, 0, Math.max(0, pr.height - el.offsetHeight)),
    });
  };

  const onPanelUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    panelDrag.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
  };

  /* ----- Walk button: click = pick a spot on the map, drag = drop the icon on the map ----- */

  const onIconDown = (e: ReactPointerEvent<HTMLButtonElement>) => {
    if (mode === "walking") return;
    if (e.pointerType === "mouse" && e.button !== 0) return;
    iconDrag.current = { x: e.clientX, y: e.clientY, moved: false };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onIconMove = (e: ReactPointerEvent<HTMLButtonElement>) => {
    const d = iconDrag.current;
    if (!d) return;
    if (!d.moved && Math.hypot(e.clientX - d.x, e.clientY - d.y) < DRAG_THRESHOLD_PX) return;
    d.moved = true;
    setGhost({ x: e.clientX, y: e.clientY });
  };

  const onIconUp = (e: ReactPointerEvent<HTMLButtonElement>) => {
    const d = iconDrag.current;
    iconDrag.current = null;
    setGhost(null);
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    if (!d?.moved || !map) return;

    suppressClick.current = true; // the click that follows a drag must not toggle the mode
    const rect = map.getCanvas().getBoundingClientRect();
    const inside =
      e.clientX >= rect.left && e.clientX <= rect.right && e.clientY >= rect.top && e.clientY <= rect.bottom;
    if (inside) startAt(map.unproject([e.clientX - rect.left, e.clientY - rect.top]));
  };

  const onIconCancel = () => {
    iconDrag.current = null;
    setGhost(null);
  };

  const onIconClick = () => {
    if (suppressClick.current) {
      suppressClick.current = false;
      return;
    }
    setMode((m) => (m === "off" ? "placing" : "off"));
  };

  if (!map) return null;

  const tooltip =
    mode === "walking"
      ? "Exit walk mode (Esc)"
      : mode === "placing"
        ? "Cancel (Esc)"
        : "Walk around: click, then pick a spot. Or drag this icon onto the map";

  return (
    <>
      {/* Walk toggle */}
      <Tooltip label={tooltip} position="left" withArrow>
        <ActionIcon
          size="lg"
          radius="md"
          aria-label="Walk mode"
          onClick={onIconClick}
          onPointerDown={onIconDown}
          onPointerMove={onIconMove}
          onPointerUp={onIconUp}
          onPointerCancel={onIconCancel}
          style={{
            position: "absolute",
            top: 136,
            right: 10,
            zIndex: 3,
            background: mode === "off" ? NAVY_DEEP : ACCENT,
            color: "#fff",
            borderTop: `3px solid ${ACCENT}`,
            boxShadow: "var(--mantine-shadow-lg)",
            touchAction: "none",
          }}
        >
          <IconWalk size={20} />
        </ActionIcon>
      </Tooltip>

      {/* Icon following the pointer while it is dragged to the map */}
      {ghost && (
        <Box
          style={{
            position: "fixed",
            left: ghost.x - 17,
            top: ghost.y - 17,
            width: 34,
            height: 34,
            borderRadius: 8,
            background: ACCENT,
            color: "#fff",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: "var(--mantine-shadow-lg)",
            pointerEvents: "none",
            zIndex: 1000,
          }}
        >
          <IconWalk size={20} />
        </Box>
      )}

      {mode === "placing" && (
        <Banner>Click the map to choose where to start · or drag the walk icon onto the map · Esc cancel</Banner>
      )}

      {walking && (
        <>
          {/* Crosshair */}
          <Box
            style={{
              position: "absolute",
              left: "50%",
              top: "50%",
              width: 8,
              height: 8,
              marginLeft: -4,
              marginTop: -4,
              borderRadius: "50%",
              background: "#fff",
              border: `2px solid ${NAVY_DEEP}`,
              pointerEvents: "none",
              zIndex: 2,
            }}
          />

          <Banner>W A S D move · Q / E or drag to look · Shift run · Esc exit</Banner>

          {/* On-screen pad (touch / mouse) */}
          <Box
            style={{
              position: "absolute",
              bottom: 40,
              left: "50%",
              transform: "translateX(-50%)",
              display: "grid",
              gridTemplateColumns: "repeat(3, 46px)",
              gap: 6,
              zIndex: 3,
            }}
          >
            <PadKey k="q" label="↶" keysRef={keysRef} />
            <PadKey k="w" label="W" keysRef={keysRef} />
            <PadKey k="e" label="↷" keysRef={keysRef} />
            <PadKey k="a" label="A" keysRef={keysRef} />
            <PadKey k="s" label="S" keysRef={keysRef} />
            <PadKey k="d" label="D" keysRef={keysRef} />
          </Box>

          {/* Floating, draggable location window (only while walking) */}
          <Paper
            ref={panelRef}
            withBorder
            radius="md"
            shadow="lg"
            bg="white"
            w={250}
            style={{
              position: "absolute",
              ...(pos ? { left: pos.x, top: pos.y } : { left: 10, bottom: 40 }),
              zIndex: 4,
              overflow: "hidden",
              borderColor: BORDER,
              borderTop: `3px solid ${ACCENT}`,
            }}
          >
            {/* Title bar = drag handle */}
            <Group
              justify="space-between"
              wrap="nowrap"
              px="xs"
              h={30}
              onPointerDown={onPanelDown}
              onPointerMove={onPanelMove}
              onPointerUp={onPanelUp}
              onPointerCancel={onPanelUp}
              style={{
                background: NAVY_DEEP,
                cursor: panelDrag.current ? "grabbing" : "grab",
                userSelect: "none",
                touchAction: "none",
              }}
            >
              <Group gap={6} wrap="nowrap">
                <IconInfoCircle size={15} color="#fff" />
                <Text fz={12} fw={700} c="#fff">
                  Location info
                </Text>
              </Group>
              <Group gap={2} wrap="nowrap">
                <IconGripHorizontal size={14} color="#fff" style={{ opacity: 0.6 }} />
                <ActionIcon
                  size="xs"
                  variant="transparent"
                  c="#fff"
                  aria-label={panelOpen ? "Collapse location info" : "Expand location info"}
                  onClick={() => setPanelOpen((o) => !o)}
                >
                  <IconChevronDown
                    size={14}
                    style={{
                      transform: panelOpen ? "rotate(180deg)" : "none",
                      transition: "transform 150ms ease",
                    }}
                  />
                </ActionIcon>
              </Group>
            </Group>

            <Collapse expanded={panelOpen}>
              {info && (
                <Stack gap={6} p="xs">
                  <Group justify="space-between" wrap="nowrap">
                    <Badge size="xs" variant="light" color="red">
                      Your position
                    </Badge>
                    <Tooltip label={clipboard.copied ? "Copied" : "Copy lat, lng"} withArrow>
                      <ActionIcon
                        size="xs"
                        variant="subtle"
                        color={clipboard.copied ? "teal" : "gray"}
                        aria-label="Copy coordinates"
                        onClick={() => clipboard.copy(`${info.lat.toFixed(6)}, ${info.lng.toFixed(6)}`)}
                      >
                        {clipboard.copied ? <IconCheck size={13} /> : <IconCopy size={13} />}
                      </ActionIcon>
                    </Tooltip>
                  </Group>

                  <Row label="Latitude">{info.lat.toFixed(6)}</Row>
                  <Row label="Longitude">{info.lng.toFixed(6)}</Row>
                  <Row label="Heading">
                    {Math.round(normBearing(info.bearing))}° {compass(info.bearing)}
                  </Row>
                  <Row label="Pitch">{Math.round(info.pitch)}°</Row>
                  <Row label="Eye height">{EYE_HEIGHT} m</Row>

                  <Box style={{ borderTop: `1px solid ${BORDER}` }} pt={6}>
                    <Row label="Road">
                      {info.roadStatus === "off" && (
                        <Text span fz={12} c="dimmed">
                          SMV layer is off
                        </Text>
                      )}
                      {info.roadStatus === "none" && (
                        <Text span fz={12} c="dimmed">
                          None within {ROAD_SEARCH_M} m
                        </Text>
                      )}
                      {info.roadStatus === "ok" && info.road && (
                        <Badge size="xs" variant="light" color={info.road.onRoad ? "green" : "orange"}>
                          {info.road.onRoad ? "On road" : `${Math.round(info.road.dist)} m away`}
                        </Badge>
                      )}
                    </Row>

                    {info.roadStatus === "ok" && info.road && (
                      <Stack gap={4} mt={6}>
                        <Row label="Street">{info.road.name}</Row>
                        {info.road.place && <Row label="Area">{info.road.place}</Row>}
                        <Row label="Road ID">{info.road.id}</Row>
                        {info.road.zonal.map((z) => (
                          <Group key={z.key} justify="space-between" wrap="nowrap" gap={8}>
                            <Group gap={6} wrap="nowrap">
                              <span
                                style={{
                                  width: 9,
                                  height: 9,
                                  borderRadius: 2,
                                  background: z.color,
                                  display: "inline-block",
                                }}
                              />
                              <Text fz={11} c="dimmed">
                                {z.label}
                              </Text>
                            </Group>
                            <Text fz={12} c={NAVY} fw={500}>
                              {z.value.toLocaleString()}
                            </Text>
                          </Group>
                        ))}
                      </Stack>
                    )}
                  </Box>

                  <Box style={{ borderTop: `1px solid ${BORDER}` }} pt={6}>
                    <Row label="Building ahead">
                      {info.buildingHeight === null ? "–" : `${Math.round(info.buildingHeight)} m tall`}
                    </Row>
                  </Box>
                </Stack>
              )}
            </Collapse>
          </Paper>
        </>
      )}
    </>
  );
}
