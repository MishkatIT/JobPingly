CREATE TABLE IF NOT EXISTS "worker_heartbeat" (
  "id" text PRIMARY KEY NOT NULL,
  "heartbeat_at" timestamp with time zone DEFAULT now() NOT NULL,
  "cycle_started_at" timestamp with time zone DEFAULT now() NOT NULL,
  "last_error" text
);
