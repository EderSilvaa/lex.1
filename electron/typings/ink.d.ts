/**
 * Type shim for ink v5 (ESM-only, uses `exports` in package.json).
 * Necessário porque tsconfig usa moduleResolution: "node" que não resolve `exports`.
 */
declare module 'ink' {
    export * from 'ink/build/index.js';
}
