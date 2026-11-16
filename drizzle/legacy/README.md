# Legacy migrations (not executed)

These files describe the schema as it was first generated. The production
database was subsequently managed with `drizzle-kit push`, so they no longer
match any real database and cannot build a working schema on their own
(`0002` references tables that none of them create).

They are kept for history only. The migration runner (`npm run db:migrate`)
ignores this folder. `../0003_schema_v2.sql` is idempotent and builds or
reconciles the complete schema from any starting point.
