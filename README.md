# ThreadGrader

Standalone X/Twitter thread viral analyzer. Built as a static-path sibling that gets served at **bilko.run/projects/thread-grader/** by the [Bilko host](https://github.com/StanislavBG/bilko-run).

Calls `bilko.run/api/demos/thread-grader{,/compare,/generate}` same-origin — Clerk session cookie + JWT travel automatically.

## Build + sync

```bash
pnpm install
pnpm build              # emits dist/
pnpm sync               # copies dist/ to ../Bilko/public/projects/thread-grader/
```

Or, from a Claude session in this repo, use the `bilko-host` MCP — it'll register the project, copy the build output, commit, and push to both remotes for you.

## Architecture

- React 18 + Vite 6 + Tailwind v4. No router. Bundles `@clerk/clerk-react` for SignInButton + JWT bearer auth.
- Slim local kit (`src/kit.tsx`) for `track()`, `<ToolHero>`, `<ScoreCard>`, `<SectionBreakdown>`, `<CompareLayout>`, `<Rewrites>`, `<CrossPromo>`. Host's full kit lives at `~/Projects/Bilko/src/components/tool-page/`.
- `useToolApi` (3 endpoints: submit / compare / generate) hooks the standalone to `bilko.run/api` same-origin. Server route stays in the host.
- Vite `base: /projects/thread-grader/` so all assets resolve under that path.

## Modes

- **Score** — POST `/api/demos/thread-grader` (1 credit) — paste a thread, get a score + 4-pillar breakdown + per-tweet feedback + hook rewrites
- **A/B Compare** — POST `/api/demos/thread-grader/compare` (2 credits) — paste two threads, get a winner with side-by-side breakdown
- **Generate** — POST `/api/demos/thread-grader/generate` (1 credit) — describe a topic + tweet count, get a full thread back with hook/tension/payoff annotations

The 4 structural pillars: Hook Strength (30), Tension Chain (25), Payoff (25), Share Trigger (20).

## Files

- `src/ThreadGraderPage.tsx` — the page (extracted from `~/Projects/Bilko/src/pages/ThreadGraderPage.tsx`)
- `src/main.tsx` — mount point + ClerkProvider
- `src/index.css` — Tailwind + warm/fire/sky/grade palette tokens + display utilities (`text-display-sm` is needed by `<CompareLayout>`)
- `src/kit.tsx` — slim `track()` + ToolHero/ScoreCard/SectionBreakdown/CompareLayout/Rewrites/CrossPromo
- `src/useToolApi.ts` — same hook as host, points to `https://bilko.run/api`
- `vite.config.ts` — base path + tailwind plugin
- `.mcp.json` — wires up `bilko-host` MCP for self-publish from a Claude session
