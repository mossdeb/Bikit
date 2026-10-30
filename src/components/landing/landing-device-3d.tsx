"use client";

import { useEffect, useRef, useState } from "react";

const MODEL_URL = "/landing/models/device.bin";
const BODY_COLOR = 0x3a3b3e;
const LOGO_COLOR = 0xffffff;
/** The first view: from above, a quarter turned, the logo towards the reader. */
const START_YAW = -0.35;
const START_PITCH = 0.75;
/** Slow enough to read as an invitation; held while dragged, and back on release. */
const IDLE_TURN_PER_MS = 0.00025;
const DRAG_PER_PX = 0.009;
/** Of the canvas: room around the object, whichever way it is turned. */
const FILL = 1.1;
/** The canvas's height, as a share of the room it is given in the page. */
const OVERSCAN = 1.28;
/** The floor's shadow: how dark at its heart, and how far under the object,
 * as a share of the object's length. */
const SHADOW_OPACITY = 0.12;
const SHADOW_GAP = 0.02;
const SHADOW_DEPTH = 0.1;

/**
 * The device in 3D, to turn by hand (by request, 2026-10-30): drag with a
 * mouse in any direction; on a phone a sideways drag turns it and an upright
 * one stays the page's scroll (`touch-action: pan-y`). There is no zoom, so
 * the wheel stays the page's too.
 *
 * The photograph stays underneath until the first frame is drawn, and for
 * good where WebGL is missing. three.js and the model are only fetched as the
 * section nears the screen, and frames are only drawn while it is on screen
 * and something moved.
 *
 * The model (public/landing/models/device.bin) is baked from the Tinkercad
 * OBJ, exterior only: a Uint32 header (vertices, logo indices, body indices),
 * the Float32 positions, then the two Uint16 index lists.
 */
export function LandingDevice3D({
  imageAlt,
  hint,
  disclaimer,
}: {
  imageAlt: string;
  hint: string;
  /** The model is not the final design: said beside it (by request, 2026-10-30). */
  disclaimer: string;
}) {
  const host = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    let cleanup = () => {};
    let cancelled = false;

    const start = async () => {
      const [THREE, { toCreasedNormals }, { RoomEnvironment }, response] = await Promise.all([
        import("three"),
        import("three/examples/jsm/utils/BufferGeometryUtils.js"),
        import("three/examples/jsm/environments/RoomEnvironment.js"),
        fetch(MODEL_URL),
      ]);
      const buffer = await response.arrayBuffer();
      if (cancelled) return;

      let renderer: import("three").WebGLRenderer;
      try {
        renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      } catch {
        return; // No WebGL: the photograph stays.
      }
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      // Taller than its place in the page, and transparent: the object can
      // stand upright at this size without being cut, and the page keeps its
      // spacing for the far more common view of it lying down.
      renderer.domElement.style.cssText = `position:absolute;left:0;top:${-((OVERSCAN - 1) / 2) * 100}%;width:100%;height:${OVERSCAN * 100}%`;

      const [vertices, logoCount, bodyCount] = new Uint32Array(buffer, 0, 3);
      const positions = new Float32Array(buffer, 12, vertices * 3);
      const logoAt = 12 + vertices * 12;
      const logoIndex = new Uint16Array(buffer, logoAt, logoCount);
      const bodyIndex = new Uint16Array(buffer, logoAt + logoCount * 2, bodyCount);

      const box = new THREE.Box3();
      box.setFromArray(positions);
      const center = box.getCenter(new THREE.Vector3());
      const size = box.getSize(new THREE.Vector3());

      const scene = new THREE.Scene();
      const pmrem = new THREE.PMREMGenerator(renderer);
      const environment = pmrem.fromScene(new RoomEnvironment(), 0.04);
      scene.environment = environment.texture;
      scene.environmentIntensity = 0.75;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1;
      // A studio's three: the key from above left, a cool fill from the other
      // side so the far face keeps its shape, and a rim behind that draws the
      // object's edge off the white page.
      const key = new THREE.DirectionalLight(0xffffff, 0.8);
      key.position.set(-1.5, 3, 2.5);
      const fill = new THREE.DirectionalLight(0xdfe8ff, 0.7);
      fill.position.set(3, 0.5, 1.5);
      const rim = new THREE.DirectionalLight(0xffffff, 0.9);
      rim.position.set(0.5, 2, -3);
      scene.add(key, fill, rim);

      const shape = (index: Uint16Array) => {
        const raw = new THREE.BufferGeometry();
        raw.setAttribute("position", new THREE.BufferAttribute(positions, 3));
        raw.setIndex(new THREE.BufferAttribute(index, 1));
        // The file has no normals: smooth where the faces nearly meet, a
        // hard edge at the object's chamfers.
        const geometry = toCreasedNormals(raw, 0.5);
        raw.dispose();
        return geometry;
      };
      const body = new THREE.Mesh(
        shape(bodyIndex),
        new THREE.MeshStandardMaterial({ color: BODY_COLOR, roughness: 0.85, metalness: 0 }),
      );
      const logo = new THREE.Mesh(
        shape(logoIndex),
        new THREE.MeshStandardMaterial({ color: LOGO_COLOR, roughness: 0.5 }),
      );

      // Inner: the file's axes (Z is up from the base) to the screen's, centred.
      const inner = new THREE.Group();
      inner.add(body, logo);
      inner.position.set(-center.x, -center.y, -center.z);
      const flat = new THREE.Group();
      flat.add(inner);
      flat.rotation.x = -Math.PI / 2;
      const pivot = new THREE.Group();
      pivot.add(flat);
      scene.add(pivot);

      // A soft blot in the picture's plane, always just under the object's
      // lowest point and as wide as it stands: the floor is close by, and the
      // object never touches it. Painted, not cast — one texture, no shadow
      // pass to pay for on every frame of a phone.
      const blot = document.createElement("canvas");
      blot.width = blot.height = 128;
      const ink = blot.getContext("2d")!;
      const fade = ink.createRadialGradient(64, 64, 0, 64, 64, 64);
      fade.addColorStop(0, "rgba(0,0,0,1)");
      fade.addColorStop(0.45, "rgba(0,0,0,0.55)");
      fade.addColorStop(1, "rgba(0,0,0,0)");
      ink.fillStyle = fade;
      ink.fillRect(0, 0, 128, 128);
      const shadowTexture = new THREE.CanvasTexture(blot);
      const shadow = new THREE.Mesh(
        new THREE.PlaneGeometry(1, 1),
        new THREE.MeshBasicMaterial({
          map: shadowTexture,
          transparent: true,
          depthWrite: false,
          opacity: SHADOW_OPACITY,
          color: 0x000000,
        }),
      );
      scene.add(shadow);

      const camera = new THREE.PerspectiveCamera(22, 1, 1, 2000);
      const half = new THREE.Vector3(size.x / 2, size.z / 2, size.y / 2);
      const matrix = new THREE.Matrix4();
      const euler = new THREE.Euler(0, 0, 0, "XYZ");

      let yaw = START_YAW;
      let pitch = START_PITCH;
      let spin = 0;
      const idle = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      let dirty = true;
      let visible = false;
      let frame = 0;
      let last = 0;
      let width = 1;
      let height = 1;
      let dragging: { x: number; y: number } | null = null;

      const resize = () => {
        width = el.clientWidth || 1;
        height = (el.clientHeight || 1) * OVERSCAN;
        renderer.setSize(width, height, false);
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
        dirty = true;
      };

      const draw = () => {
        euler.set(pitch, yaw, 0);
        pivot.rotation.copy(euler);
        // The camera never moves (by request, 2026-10-30): placed once, for the
        // object's reach in any turn, so the zoom is the same in all of them.
        // Only the shadow follows, staying just under the lowest point.
        matrix.makeRotationFromEuler(euler);
        const e = matrix.elements;
        const across = Math.abs(e[0]) * half.x + Math.abs(e[4]) * half.y + Math.abs(e[8]) * half.z;
        const upright = Math.abs(e[1]) * half.x + Math.abs(e[5]) * half.y + Math.abs(e[9]) * half.z;
        const gap = size.x * SHADOW_GAP;
        const depth = size.x * SHADOW_DEPTH;
        const below = gap + depth / 2;
        const reach = half.length();
        const tan = Math.tan((camera.fov * Math.PI) / 360);
        const fit = Math.max(reach + below / 2, reach / camera.aspect) / (tan * FILL);
        shadow.position.set(0, -upright - gap, 0);
        shadow.scale.set(across * 2 * 0.95, depth, 1);
        camera.position.set(0, -below / 2, fit + reach * 0.4);
        renderer.render(scene, camera);
      };

      const loop = (now: number) => {
        frame = 0;
        if (!visible) return;
        const elapsed = Math.min(now - last, 50);
        last = now;
        if (idle && !dragging) {
          yaw += IDLE_TURN_PER_MS * elapsed;
          dirty = true;
        }
        if (!dragging && Math.abs(spin) > 0.00002) {
          yaw += spin * elapsed;
          spin *= Math.pow(0.994, elapsed);
          dirty = true;
        }
        if (dirty) {
          dirty = false;
          draw();
        }
        frame = requestAnimationFrame(loop);
      };
      const run = () => {
        if (!frame) {
          last = performance.now();
          frame = requestAnimationFrame(loop);
        }
      };

      const canvas = renderer.domElement;
      canvas.style.touchAction = "pan-y";
      canvas.style.cursor = "grab";
      let lastMoveAt = 0;

      const onDown = (event: PointerEvent) => {
        canvas.setPointerCapture(event.pointerId);
        dragging = { x: event.clientX, y: event.clientY };
        canvas.style.cursor = "grabbing";
        spin = 0;
        setTouched(true);
      };
      const onMove = (event: PointerEvent) => {
        if (!dragging) return;
        const dx = event.clientX - dragging.x;
        const dy = event.clientY - dragging.y;
        dragging = { x: event.clientX, y: event.clientY };
        yaw += dx * DRAG_PER_PX;
        // Upright is the page's scroll on a touch screen.
        if (event.pointerType === "mouse") {
          pitch = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, pitch + dy * DRAG_PER_PX));
        }
        const now = performance.now();
        spin = (dx * DRAG_PER_PX) / Math.max(now - lastMoveAt, 8);
        lastMoveAt = now;
        dirty = true;
      };
      const onUp = () => {
        dragging = null;
        canvas.style.cursor = "grab";
        // Let go after a pause: no throw.
        if (performance.now() - lastMoveAt > 80) spin = 0;
      };
      canvas.addEventListener("pointerdown", onDown);
      canvas.addEventListener("pointermove", onMove);
      canvas.addEventListener("pointerup", onUp);
      canvas.addEventListener("pointercancel", onUp);

      const resizer = new ResizeObserver(resize);
      resizer.observe(el);
      const watcher = new IntersectionObserver(([entry]) => {
        visible = entry.isIntersecting;
        if (visible) run();
      });
      watcher.observe(el);

      resize();
      draw();
      el.appendChild(canvas);
      setReady(true);

      cleanup = () => {
        cancelAnimationFrame(frame);
        resizer.disconnect();
        watcher.disconnect();
        canvas.removeEventListener("pointerdown", onDown);
        canvas.removeEventListener("pointermove", onMove);
        canvas.removeEventListener("pointerup", onUp);
        canvas.removeEventListener("pointercancel", onUp);
        canvas.remove();
        for (const mesh of [body, logo]) {
          mesh.geometry.dispose();
          (mesh.material as import("three").Material).dispose();
        }
        shadow.geometry.dispose();
        (shadow.material as import("three").Material).dispose();
        shadowTexture.dispose();
        environment.dispose();
        pmrem.dispose();
        renderer.dispose();
      };
    };

    // Fetched as it nears the screen; the page before it owes it nothing.
    const approach = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        approach.disconnect();
        start().catch(() => {}); // The photograph stays.
      },
      { rootMargin: "600px" },
    );
    approach.observe(el);

    return () => {
      cancelled = true;
      approach.disconnect();
      cleanup();
    };
  }, []);

  return (
    <div className="mt-4 w-full max-w-[860px]">
      <div
        ref={host}
        role="img"
        aria-label={imageAlt}
        className="relative aspect-[5/3] w-full select-none"
      >
        <img
          src="/landing/images/home-device.webp"
          alt=""
          className={`absolute inset-0 m-auto w-[84%] transition-opacity duration-300 ${ready ? "opacity-0" : ""}`}
        />
      </div>
      <div className="relative pb-8 md:pb-10">
        <p
          aria-hidden={touched}
          className={`text-center text-xs font-medium text-[#8A8D93] transition-opacity duration-300 ${
            ready && !touched ? "" : "opacity-0"
          }`}
        >
          {hint}
        </p>
        <p className="mt-1 text-center text-[11px] text-[#8A8D93] md:absolute md:top-0 md:right-0 md:mt-0 md:text-right">
          {disclaimer}
        </p>
      </div>
    </div>
  );
}
