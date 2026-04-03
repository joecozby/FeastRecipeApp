# Feast — Project Context for Claude

## What is Feast?

Feast is a production-ready personal recipe organizer web app built as a Harvard MBA DSAIL coding project. It lets users save, organize, import, and scale recipes. The MVP is fully built and deployed on Railway.

The core user loop is:
1. Import a recipe (from a URL, Instagram caption, or pasted text)
2. View and scale it by servings
3. Organize into cookbooks
4. Add to a grocery list (quantities merge automatically across recipes)

---

## Monorepo Structure

```
FeastRecipeApp/          ← repo root (treat as monorepo root)
├── apps/
│   ├── api/             ← @feast/api  (Node.js + Express backend)
│   └── web/             ← @feast/web  (React + Vite frontend)
├── packages/
│   └── shared/          ← @feast/shared (TypeScript types only)
├── turbo.json
├── package.json         ← npm workspaces root
├── railway.api.json     ← Railway config for API service
├── railway.web.json     ← Railway config for web service
└── railpack.toml        ← Suppresses Railpack's default npm ci build step
```

**Critical rule:** The monorepo root IS `FeastRecipeApp/`. There is no nested `feast/` subfolder. All paths are relative to this root.

---

## Tech Stack & Why

### Backend — `apps/api`
| Technology | Choice | Reason |
|---|---|---|
| Runtime | Node.js v20+ | ESM modules, required by undici/BullMQ |
| Framework | Express | Lightweight, well-understood |
| Database | PostgreSQL (Railway managed) | Relational, FTS via tsvector + pg_trgm |
| Queue | BullMQ + ioredis | Job pipeline for recipe imports |
| Auth | JWT (30-day tokens, email+password only) | Simple, stateless, no OAuth complexity for MVP |
| Password hashing | bcryptjs | Standard |
| Logging | Winston | JSON in prod, colorized in dev |
| Validation | express-validator | Per-route validation chains |
| AI parsing | @anthropic-ai/sdk (claude-sonnet-4-5) | Parses raw scraped text into structured recipe JSON |
| Web scraping | Cheerio + node-fetch | JSON-LD extraction with meta-tag fallback |

### Frontend — `apps/web`
| Technology | Choice | Reason |
|---|---|---|
| Framework | React 18 + Vite + TypeScript | Fast builds, great DX |
| Routing | React Router v6 | Standard, nested routes |
| Server state | TanStack React Query v5 | Infinite queries, optimistic updates, polling |
| Client state | Zustand with persist | Auth token persisted to localStorage |
| HTTP | Axios with interceptors | JWT injection, 401→logout |
| Styling | CSS custom properties only | No Tailwind/MUI — design tokens via CSS vars |

### Infrastructure
| Service | Provider | Reason |
|---|---|---|
| API hosting | Railway | Supports Node.js + env vars + private networking |
| Web hosting | Railway (static via Caddy) | Same project, simple |
| PostgreSQL | Railway managed | Internal hostname, no external exposure needed |
| Redis | Railway managed | BullMQ job queue backing store |

---

## Key Architectural Decisions

### Authentication
- JWT only — email + password, no OAuth, no magic links
- 30-day token expiry
- Token stored in Zustand `persist` → localStorage key `feast-auth`
- `requireAuth` middleware validates JWT on every protected route
- 401 response from API → Axios interceptor calls `logout()` automatically

### Database
- 12 migration files in `apps/api/src/db/migrations/` run in alphabetical order
- Migration runner tracks applied files in `_migrations` table — safe to re-run
- Soft deletes on recipes and users (`deleted_at` column)
- Full-text search via `tsvector` column + `pg_trgm` extension
- Ingredient normalization: canonical ingredients table with aliases, fuzzy matching via pg_trgm similarity > 0.5

### Recipe Import Pipeline
The import flow is: **POST /import** → creates DB job + enqueues BullMQ → worker picks it up → scrape → AI parse → normalize ingredients → save recipe → update job status.

Three import source types:
1. **URL** — Cheerio scrapes JSON-LD structured data, falls back to meta tags
2. **Instagram** — mobile user-agent scrape; throws `INSTAGRAM_BLOCKED` if caption < 20 chars → frontend detects this specific string and shows "paste caption instead" CTA
3. **Text** — raw pasted text sent directly to AI parser

AI parser (`apps/api/src/services/aiParser.js`):
- Stubs gracefully when `ANTHROPIC_API_KEY` is absent or set to `sk-ant-stub`
- Returns a valid `ParsedRecipe` schema so the pipeline completes end-to-end in development
- Real path calls `claude-sonnet-4-5` with a strict JSON-only system prompt

### Ingredient Normalizer
Deterministic (no AI). Pipeline:
1. Parse raw text → quantity + unit + prep + notes
2. Exact alias lookup → canonical ingredient
3. pg_trgm fuzzy match (similarity > 0.5) → canonical ingredient
4. Create new ingredient if no match found
5. Always preserves `raw_text` regardless of resolution

### Grocery List Merge Logic
When a recipe is added to the grocery list, `mergeGroceryList()` runs:
- Groups items by `ingredient_id + unit` (for resolved ingredients) or `raw_text` (for unresolved)
- Sums quantities across all recipes
- Preserves `is_checked` state on existing items
- Deletes all items and re-inserts the merged set atomically
- Optimistic updates on checkbox toggle (TanStack Query `onMutate`)

### Serving Scaler
- State: `servings` (local React state, null = use base_servings)
- `base_servings` from API is always `Math.round()`-ed to avoid float drift
- Scale factor = `currentServings / base_servings`
- Ingredient quantities multiplied by scale factor and formatted to 2 decimal places, trailing zeros stripped

### Search
- Backend: `fts_vector` (tsvector) + `pg_trgm` similarity; score = `ts_rank * 2 + similarity`
- Filters: cuisine, difficulty, tags (comma-separated array), cookbook
- Cursor pagination by score
- Frontend: URL-synced filters via `useFilterState` hook (uses `useSearchParams`, replace mode)
- Infinite scroll via `IntersectionObserver` on a sentinel div

### Frontend Patterns
- All protected pages are lazy-loaded via `React.lazy` + `Suspense`
- `PrivateRoute` component checks token, redirects to `/login` if absent
- `useFilterState<T>(key, default)` — generic hook that syncs a value to a URL search param
- No UI component libraries — custom primitives only: `Button`, `Input`, `Textarea`, `Modal`, `EmptyState`, `RecipeCard`
- Design tokens via CSS custom properties: `--color-primary: #E8622A`, `--nav-width: 240px`, etc.

---

## API Endpoints Summary

```
POST   /api/auth/register
POST   /api/auth/login
GET    /api/auth/me
PATCH  /api/auth/profile          ← display_name, bio

GET    /api/recipes                ← cursor paginated, filter by status
POST   /api/recipes
GET    /api/recipes/:id            ← full detail with ingredients, instructions, tags
PATCH  /api/recipes/:id
DELETE /api/recipes/:id            ← soft delete
PATCH  /api/recipes/:id/publish
PUT    /api/recipes/:id/content    ← atomic save of ingredients + instructions + tags

POST   /api/import
GET    /api/import/:jobId          ← poll every 2s until done/failed

GET    /api/cookbooks
POST   /api/cookbooks
GET    /api/cookbooks/:id          ← includes recipes array
PATCH  /api/cookbooks/:id
DELETE /api/cookbooks/:id
POST   /api/cookbooks/:id/recipes
DELETE /api/cookbooks/:id/recipes/:rid

GET    /api/grocery-lists
POST   /api/grocery-lists/recipes
DELETE /api/grocery-lists/recipes/:id
PATCH  /api/grocery-lists/items/:id

GET    /api/search                 ← FTS + trgm, cursor by score
GET    /api/tags                   ← fuzzy search
POST   /api/tags                   ← upsert
POST   /api/media/presign          ← stub
POST   /api/media
DELETE /api/media/:id

GET    /api/health                 ← no auth, used by Railway health check
```

---

## Frontend Pages & Routes

```
/login                    → LoginPage (demo@feast.app / password123)
/register                 → RegisterPage
/                         → HomePage (greeting, stats, recent recipes)
/recipes                  → RecipeListPage (infinite scroll, tab filters, import CTA)
/recipes/:id              → RecipeDetailPage (cover, scaler, ingredients, instructions, actions)
/recipes/:id/edit         → RecipeEditPage (full edit form)
/import                   → ImportPage (URL / Instagram / Text tabs, polls job status)
/cookbooks                → CookbooksPage (grid, create modal)
/cookbooks/:id            → CookbookDetailPage (recipe grid, edit modal, remove recipe)
/grocery                  → GroceryPage (merged items, recipe list, checkbox toggle)
/search                   → SearchPage (FTS + filters, infinite scroll)
/profile                  → ProfilePage (display name, bio, sign out)
```

---

## Environment Variables

### API service (`apps/api`)
```
DATABASE_URL        postgresql://...@postgres.railway.internal:5432/railway
REDIS_URL           redis://...@redis.railway.internal:6379
JWT_SECRET          (48-byte hex string)
NODE_ENV            production
ALLOWED_ORIGINS     https://your-web-url.up.railway.app
ANTHROPIC_API_KEY   sk-ant-... (or sk-ant-stub to use stub parser)
UNSPLASH_ACCESS_KEY (optional) free key from unsplash.com/developers — enables AI Chef cover photos
PORT                (injected by Railway automatically)
```

### Web service (`apps/web`)
```
VITE_API_URL              https://your-api-url.up.railway.app/api
RAILPACK_SPA_OUTPUT_DIR   apps/web/dist
RAILPACK_NODE_VERSION     20
```

---

## Railway Deployment

Four services in one Railway project:
1. **Postgres** — managed, private networking via `.railway.internal`
2. **Redis** — managed, private networking via `.railway.internal`
3. **APIservice** — Node.js; config file `railway.api.json`; start command runs migrations then server
4. **webservice** — Static site; build command `npm install && npm run build --workspace=@feast/web`; served by Caddy

**Important Railway quirks discovered:**
- Railpack 0.23 ignores dashboard Build Command for the build phase and injects `npm ci` by default — fixed via `railpack.toml` setting `[phases.build] cmds = []`
- `npm ci` fails with EBUSY on `.vite` cache when another install already ran — fixed by using `npm install` instead
- Node 18 crashes with `ReferenceError: File is not defined` from undici — fixed by setting `engines.node >= 20.0.0` and `RAILPACK_NODE_VERSION=20`
- `.railway.internal` hostnames only work inside Railway's private network — use `DATABASE_PUBLIC_URL` for local seeding
- `VITE_API_URL` is a **build-time** variable — must be set before the web service builds, not just at runtime

---

## Database Seeding

Demo data is in `apps/api/src/db/seed.js`. It is idempotent (uses `ON CONFLICT` guards).

To seed locally against the live Railway DB (requires public URL from Railway Postgres → Variables → `DATABASE_PUBLIC_URL`):
```powershell
$env:DATABASE_URL="postgresql://postgres:PASSWORD@caboose.proxy.rlwy.net:PORT/railway"; npm run db:seed --workspace=@feast/api
```

Demo credentials: `demo@feast.app` / `password123`

---

## Known Issues & Fixes Applied

| Issue | Fix |
|---|---|
| `base_servings` has float drift (4.001) | `Math.round()` applied to base and step increments in RecipeDetailPage |
| Tags stored as `{"name":"dinner"}` JSON strings | Frontend was sending `tags.map(n => ({name: n}))` objects instead of strings; API now handles both; fix bad rows with `UPDATE tags SET name = name::json->>'name' WHERE name LIKE '{"name":"%"}'` |
| `import.meta.env` TypeScript error | Added `apps/web/src/vite-env.d.ts` with `/// <reference types="vite/client" />` |
| `useFilterState` infers `''` literal type | Callers use explicit generic `useFilterState<string>(...)` |

---

## What's Built (MVP Complete)

- [x] Database schema (12 migrations)
- [x] Auth (register, login, JWT, profile)
- [x] Recipe CRUD with soft delete + publish/draft
- [x] Ingredient normalizer (deterministic, no AI)
- [x] Recipe import pipeline (BullMQ workers, scraper, AI parser stub)
- [x] Cookbook CRUD + recipe associations
- [x] Grocery list with merge logic + optimistic checkbox
- [x] Full-text + similarity search with filters
- [x] All frontend pages (Home, Recipes, Import, Cookbooks, Grocery, Search, Profile)
- [x] Serving scaler with proportional ingredient quantities
- [x] URL-synced filters, infinite scroll
- [x] Deployed to Railway (API + Web + Postgres + Redis)

## What's Next (Post-MVP)

- [ ] Real S3/R2 media upload (cover images) — stub currently returns a fake URL
- [ ] Real Anthropic API key for AI parsing (set `ANTHROPIC_API_KEY` in Railway)
- [ ] Nutrition worker (stub currently, USDA API integration planned)
- [ ] Social features (posts, comments, likes, follows) — schema exists in migration 012, dormant
- [ ] Password reset flow
- [ ] Mobile responsive layout
- [ ] Recipe sharing (public URLs)
