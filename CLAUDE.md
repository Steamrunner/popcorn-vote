# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Popcorn Vote is a self-hosted family movie-night voting app: SvelteKit (Svelte 5, TypeScript) on `adapter-node`, SQLite through `better-sqlite3`, shipped as a Docker image on port 3000. `SPECIFICATION.md` is the binding functional reference. When code and specification disagree, one of them is a bug. `CONTRIBUTING.md` holds the house rules summarized below.

## Commands

```sh
npm install
npx svelte-kit sync                       # once; generates what `check` reads
DATA_DIR=./data PV_PIN=1234 npm run dev   # nothing useful starts without DATA_DIR and a PIN (or browser setup)
npm test                                  # vitest unit tests
npx vitest run src/lib/server/game.test.ts         # one test file
npx vitest run src/lib/server/game.test.ts -t "name"  # one test by name
npm run test:coverage                     # coverage with the CI floor (thresholds in vite.config.ts)
npm run lint                              # prettier --check + eslint
npm run format                            # prettier --write
npm run check                             # svelte-kit sync + svelte-check
npm run build && npm run test:e2e         # Playwright (Chromium) against the built server on :4173
npm run verify                            # everything CI runs: secrets, lint, check, coverage, build, prod audit
.github/no-german-characters.sh           # CI tripwire, see below
bash packaging/check.sh                   # store packages still match docker-compose.yml
node docs/website-src/generate.mjs [--check]  # regenerate docs/website/ from docs/website-src/
```

E2E tests start `node build/index.js` with a fresh `e2e/.data` and `PV_MEMBERS=Anna,Ben,Carla,David`; the `setup` project (`e2e/setup.auth.ts`) runs first. Set `PLAYWRIGHT_CHROMIUM_PATH` to use a preinstalled Chromium. CI also runs WebKit on pull requests.

## Architecture

- **All logic lives in `src/lib/server/`.** Routes and Svelte components stay thin. A typical API route (`src/routes/api/*/+server.ts`) is a few lines: `handled(locals, async () => { ... })` from `lib/server/api.ts`, a helper like `requirePerson`/`requestJsonObject`, then a call into `game.ts` or a sibling module.
- **`handled()`** is the single error funnel for API endpoints. It renders `RuleError` in the request's language and logs unexpected errors with a short reference that is also shown on screen. `handleError` in `hooks.server.ts` shares the same `logFailure` so the on-screen reference matches the log.
- **`hooks.server.ts`** loads config, opens the DB, ensures balances, starts the scheduler (weekly vote credit, nightly backup in `schedule.ts`) and seeds demo data at startup. Per request it puts `config` and `db` on `event.locals`, resolves the locale, and enforces the PIN/auth guard. `OPEN_PATHS` lists what is reachable unauthenticated.
- **Config** (`config.ts`, `loadConfig()`, cached): environment variables override `config.yaml` in `DATA_DIR` (default `/data`; `PV_CONFIG` points to another file), which overrides built-in defaults. Unusable values are ignored with a warning. `.env.example` and `config.example.yaml` list every supported setting. Settings edited in the app go through `config-service.ts`/`settings.ts`.
- **Database** (`db.ts`): schema is `CREATE TABLE IF NOT EXISTS` plus additive column migrations in `applySchema()`. No migration framework. All persistent state (DB, config, covers, backups) lives in `DATA_DIR`.
- **Game rules** (`game.ts`, `standings.ts`, `tonight.ts`): balances, stakes, evaluation with tie-break wheel, free pick, absent members, archive and ratings. `standings.ts` sits outside `server/` because the client renders standings too.
- **External data**: `tmdb.ts` (TMDB search, posters, trailers; OMDb for IMDb rating). Covers are stored locally and served by `src/routes/covers/[file]`.
- **i18n**: `messages/<locale>.json` catalogues, wired up in `src/lib/i18n/catalogues.ts` and `locales.ts` (explicit imports, not `import.meta.glob`, to keep the typed `MessageKey`). `en.json` is the source language. Adding a language means a JSON file plus entries in both files.
- **CSP** is strict and set in `svelte.config.js`. New external origins (images, frames) must be added there.

## House rules

- **Everything is English**: identifiers, comments, file names, routes, commits, operator logs. Exceptions are `messages/` and input handled by `slugify()`. CI's `.github/no-german-characters.sh` enforces this.
- **No visible text as a literal in a component.** Add the key to every catalogue under `messages/`.
- **Rule violations throw `RuleError` with a catalogue key**, never a finished sentence. Operator log lines are English and stay out of the catalogues.
- **A vote on screen is a `token` in code.** Keep this split; do not rename one side to match the other.
- **Unit tests sit beside the code as `*.test.ts` and never write to the file system.** Config fixtures live in `src/lib/server/testdata/` and are selected via `PV_CONFIG`.
- Changing visible text can break E2E selectors in `e2e/`. Check them.
- Never commit on `main`. PRs are squash-merged, one topic per PR against `main`, never stacked. A merge to `main` publishes the `:latest` image that installs pull overnight.
- A release version needs a matching `## v<version>` section in `CHANGELOG.md`.
- `docker-compose.yml` is the source of truth for port, data path and environment variables. Changing any of them means updating the store packages under `packaging/` (`check.sh` fails otherwise).
- `docs/website/` is generated. Edit `docs/website-src/` and run the generator.
