# effect-modbus-rs

Type-safe Modbus communication via Effect-TS, wrapping the `modbus-rs` npm bindings (Rust napi-rs under the hood).

## Stack

- **Runtime**: Bun — never use Node, npm, pnpm, yarn, or vite.
- **Language**: TypeScript 6 (ESNext target, `verbatimModuleSyntax`, bundler module resolution).
- **Core libs**: `effect` (v3.21.x), `modbus-rs` (v0.15.x).
- **LSP**: `@effect/language-service` plugin is configured in `tsconfig.json` `compilerOptions.plugins`.
- **License**: GPL-3.0.

## Commands

| Action | Command |
|--------|---------|
| Install | `bun install` |
| Run | `bun run index.ts` |
| Type-check | `bunx tsc --noEmit` |
| Test | `bun test` (no tests exist yet — create under `**/*.test.ts`) |

There is no build step — `noEmit` is on; Bun runs `.ts` directly.

## Structure

```
index.ts          — entry point (currently a stub)
```

The repo is early-stage scaffolding. The goal is an Effect-friendly API over `modbus-rs` (`import { ... } from "modbus-rs"`) wrapping Modbus TCP/RTU operations in `Effect` types.

## Conventions

- Follow `effect` idioms: `Effect`, `Layer`, `Schema`, `Scope` throughout.
- Use `Bun.test` / `import { test, expect } from "bun:test"` for tests.
- Use `verbatimModuleSyntax` — always `import type` for type-only imports.
- Don't use `dotenv` — Bun loads `.env` automatically.

## Referencing upstream libraries

Shallow clones of key dependencies live in `references/` for offline browsing (types, exports, implementation patterns). These are gitignored — re-clone if stale.

| Reference | Clone source |
|-----------|-------------|
| effect | `https://github.com/Effect-TS/effect.git` |
| modbus-rs | `https://github.com/Raghava-Ch/modbus-rs.git` (Node.js bindings at `mbus-ffi/nodejs`) |

When researching how to use a type, function, or module from either library, read the corresponding clone in `references/` instead of guessing. For modbus-rs specifically, the npm-facing source is under `references/modbus-rs/mbus-ffi/nodejs` (types in `index.d.ts`, implementation in `index.js`).
