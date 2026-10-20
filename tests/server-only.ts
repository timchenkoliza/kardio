// Vitest shim for Next.js `server-only` marker imports.
// Production/server boundaries remain enforced by Next.js; unit tests only need
// the marker module to resolve while exercising server-side pure functions.
export {};
