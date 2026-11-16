# JobPingly

JobPingly watches the careers pages of companies you choose and tells you when a job that matches your keywords is posted. You group companies into watchlists, set your own alert rules for each list, and get a digest email on the schedule you pick. Watchlists can be private or public; public ones can be followed by other people, who set their own keywords.

Live site: <https://jobpingly.onrender.com>

## What it does

- **Monitors careers pages** through dedicated adapters for Greenhouse, Lever, Ashby, Workday, SmartRecruiters, Recruitee, Workable, BambooHR, Personio and Pinpoint, a structured-data/HTML extractor for ordinary company sites, and optional AI-assisted extraction (Groq, OpenAI or Ollama) for pages nothing else understands.
- **Detects changes reliably**: new, updated, closed and re-opened jobs, with a history per job. A job closes only after it has been missing from consecutive scans, and a sudden mass disappearance is held back as suspicious instead of closing everything.
- **Matches jobs to alert rules**: groups of keywords (any of these, and any of those), exclusions, the fields to search, workplace, employment type, level and location filters, with a live preview and an explanation of why each job matched.
- **Delivers alerts** as digests (instantly, every 6/12 hours, daily, twice weekly, weekly, every two weeks, monthly or a custom interval) in the user's time zone, plus in-app notifications. One-click unsubscribe.
- **Tracks applications** on a board from saved to offer, with notes, reminders and CSV export.
- **Admin panel** with role-based access (support, moderator, admin, owner): platform overview, users, sources and scan history, jobs, workers and the scan queue, email delivery and approvals, reported issues, settings and an append-only audit log.

## Tech stack

Next.js 16 (App Router) · React 19 · TypeScript · Tailwind CSS · PostgreSQL with Drizzle ORM and postgres.js · a PostgreSQL-backed work queue for the background worker · Brevo for email (optional; a console mode logs emails instead) · Node's built-in test runner.

## Running it locally

Requirements: Node.js 20.9 or newer (22 recommended, see `.nvmrc`) and PostgreSQL 14 or newer.

```bash
npm install
cp .env.example .env.local        # then set DATABASE_URL
npm run db:migrate                 # creates or upgrades the schema
npm run dev                        # web app on http://localhost:3000
npm run dev:worker                 # background worker (second terminal)
```

With `EMAIL_PROVIDER=console` (the default without a Brevo key), emails are printed in the terminal, including sign-up codes.

To explore without signing up, create a demo account on a local database:

```bash
npm run seed:demo -- --owner      # demo@jobpingly.test; password: SEED_DEMO_PASSWORD or the default in scripts/seed-demo.ts
npm run worker:once                # scan the demo companies once
```

Give an existing account a staff role with `npm run admin:grant -- you@example.com owner`.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` / `npm run dev:worker` | Development server and worker with reload |
| `npm run build` | Production build |
| `npm start` | Production: applies migrations, then starts the web server and (by default) the worker |
| `npm run worker` / `npm run worker:once` | Long-running worker / a single cycle (for cron or GitHub Actions) |
| `npm run db:migrate` / `npm run db:check` | Apply migrations / compare the database with the code's schema |
| `npm run scan:url -- <url>` | Dry-run extraction of one careers page; stores nothing |
| `npm run admin:grant -- <email> <role>` | Set an account's role from the command line |
| `npm run seed:demo` | Local demo account and watchlist (refuses production and remote databases) |
| `npm test` / `npm run test:unit` / `npm run test:integration` | Tests (integration tests need a database whose name ends in `_test`) |
| `npm run lint` / `npm run typecheck` | ESLint / TypeScript |

## Tests

Unit tests need nothing else. Integration tests run the real route handlers and services against a disposable PostgreSQL database; set `DATABASE_URL` to a database whose name ends in `_test` in `.env.test.local`. The runner wipes and migrates it, and refuses any other database. Network access is faked in tests (HTTP and DNS).

## Project layout

```
app/            pages (public site, auth, dashboard, admin) and API routes (app/api)
components/     UI kit (components/ui), app, admin and marketing components
lib/            server code: auth, database, monitoring engine, matching, email, notifications, admin services
worker/         background worker entry point
scripts/        start, migrate, schema check, scan-url, grant-role, seed-demo, test runner
drizzle/        SQL migrations (drizzle/legacy holds the pre-v2 files, never executed)
tests/          unit and integration tests
docs/           documentation
```

## Documentation

- [Architecture](docs/ARCHITECTURE.md)
- [API reference](docs/API.md)
- [Database](docs/DATABASE.md)
- [Deployment](docs/DEPLOYMENT.md)
- [Admin guide](docs/ADMIN_GUIDE.md)
- [User guide](docs/USER_GUIDE.md)
- [Security](SECURITY.md)
- [Changelog](CHANGELOG.md)

## License

Earlier versions of this README stated the MIT License, but the repository does not contain a `LICENSE` file yet. Add one to make the terms explicit.
