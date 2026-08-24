/**
 * leaflet-rotate ships no types. This shorthand keeps the side-effect
 * import compiling; the options and methods it patches onto Leaflet are
 * typed in leaflet-rotate-augment.d.ts — the two cannot share a file,
 * because a module file turns this shorthand into an augmentation of a
 * module that has no types to augment.
 */
declare module "leaflet-rotate";
