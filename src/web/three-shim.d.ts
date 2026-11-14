/**
 * three.js (0.187) ships JavaScript without type declarations.
 *
 * `@types/three` is deliberately NOT installed: on this toolchain (TypeScript
 * 5.7 / Node 24 / Windows) including it makes `tsc` exhaust its zone allocator
 * while compiling the full web program ("Zone Allocation failed"), even with a
 * 4 GB heap. Declaring the module here keeps the whole project type-checkable;
 * the 3D layer is therefore typed at the module boundary rather than per-API.
 *
 * The scene itself is verified in a real browser (rendering, resize, pointer
 * parallax, context-loss fallback and disposal), not by the type checker.
 */
declare module 'three';
