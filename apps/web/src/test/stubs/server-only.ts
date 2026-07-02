// Test stub for the `server-only` package. In production `server-only` is an empty module
// whose sole purpose is a BUILD-TIME error if it is ever pulled into a client bundle; it has
// no runtime behavior. Vitest (plain node, no Next bundler) can't resolve the real package, so
// modules that guard themselves with `import 'server-only'` (e.g. lib/mirror.ts) fail to load.
// Aliasing `server-only` → this empty module in vitest.config.ts lets those server modules be
// imported for unit tests of their PURE exports, matching the module's real (no-op) runtime.
export {};
