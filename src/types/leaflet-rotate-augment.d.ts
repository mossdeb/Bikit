/**
 * The pieces of leaflet-rotate's surface the IMU map actually uses — the
 * map options that switch rotation on and the bearing accessors. The plugin
 * patches Leaflet in place, so the types land on Leaflet's own module.
 */
import "leaflet";

declare module "leaflet" {
  interface MapOptions {
    /** Enables the rotation machinery (leaflet-rotate). */
    rotate?: boolean;
    /** Initial rotation: the compass direction that points up on screen. */
    bearing?: number;
    /** Two-finger rotation gesture (leaflet-rotate). */
    touchRotate?: boolean;
    /** Shift+drag rotation (leaflet-rotate). */
    shiftKeyRotate?: boolean;
    /** The plugin's own compass/reset control (leaflet-rotate). */
    rotateControl?: boolean | { closeOnZeroBearing?: boolean };
  }

  interface Map {
    setBearing(bearing: number): this;
    getBearing(): number;
  }
}
