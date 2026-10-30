import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import { pool } from "@workspace/db";

const PgSession = connectPgSimple(session);

// Eagerly create the session table if it doesn't exist
export async function initSessionTable(): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Create table only if missing
    await client.query(`
      CREATE TABLE IF NOT EXISTS "session" (
        "sid" varchar NOT NULL COLLATE "default",
        "sess" json NOT NULL,
        "expire" timestamp(6) NOT NULL
      ) WITH (OIDS=FALSE);
    `);

    // Add primary key only if it doesn't already exist
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conname = 'session_pkey' AND conrelid = '"session"'::regclass
        ) THEN
          ALTER TABLE "session" ADD CONSTRAINT "session_pkey"
            PRIMARY KEY ("sid") NOT DEFERRABLE INITIALLY IMMEDIATE;
        END IF;
      END $$;
    `);

    // Index is idempotent via IF NOT EXISTS
    await client.query(`CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON "session" ("expire");`);

    await client.query("COMMIT");
  } catch (err: any) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("[session] Error initializing session table:", err.message);
  } finally {
    client.release();
  }
}

export function createSessionMiddleware() {
  return session({
    store: new PgSession({
      pool,
      tableName: "session",
      createTableIfMissing: false, // We create it manually above
    }),
    secret: process.env.SESSION_SECRET || "fallback-secret-change-me",
    resave: false,
    saveUninitialized: false,
    cookie: {
      // Managed Preview and production are HTTPS even when the app process
      // receives proxied HTTP requests from the platform.
      secure: true,
      sameSite: "none",
      httpOnly: true,
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
    },
  });
}
