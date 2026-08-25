"use client";

import { useLayoutEffect } from "react";

/**
 * The IMU lab's dot grid, switched on for as long as a lab page is mounted.
 *
 * It renders nothing. The texture itself is a background-image on the app
 * shell (see `globals.css`), and this only marks `<body>` so that rule can
 * find it — the same move `AppHeader` makes for the merged header.
 *
 * **Why a background and not an overlay:** the shell is the element that
 * paints `bg-background`, so a texture drawn there sits under every card,
 * control and portal by construction. A fixed overlay would have to be
 * threaded between that background and the content, which is a z-index
 * argument with the whole app rather than with this page.
 *
 * Scoped by mount: the class arrives with the page and leaves with it, so
 * no route outside `/labs/imu` renders a byte differently.
 */
export function ImuLabTexture() {
  useLayoutEffect(() => {
    document.body.classList.add("imu-lab-texture");
    return () => document.body.classList.remove("imu-lab-texture");
  }, []);
  return null;
}
