import app from "./app";
import { logger } from "./lib/logger";
import pg from "pg";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

// ── Startup DB diagnostic ────────────────────────────────────────────────────
// Runs once at boot to confirm which database the pg Pool is actually connected
// to and whether it is a primary or a replica.  This output appears in the
// first few lines of every deployment log so we can verify the connection
// without needing to trigger an approval.
async function runDbStartupDiagnostic() {
  const rawUrl = process.env["SUPABASE_DB_URL"] ?? "";

  // Mask the password in the URL for safe logging.
  let maskedUrl = "(not set)";
  try {
    const u = new URL(rawUrl);
    if (u.password) u.password = "***";
    maskedUrl = u.toString();
  } catch {
    maskedUrl = rawUrl ? "(unparseable URL)" : "(not set)";
  }

  logger.info({ maskedUrl }, "[DB STARTUP] SUPABASE_DB_URL resolved to");

  if (!rawUrl) {
    logger.error("[DB STARTUP] SUPABASE_DB_URL is empty — writes will fail");
    return;
  }

  const pool = new pg.Pool({
    connectionString: rawUrl,
    ssl: { rejectUnauthorized: false },
    max: 1,
  });

  try {
    const client = await pool.connect();
    try {
      const result = await client.query<{
        server: string;
        db: string;
        usr: string;
        in_recovery: boolean;
        version: string;
      }>(
        `SELECT
           inet_server_addr()::text          AS server,
           current_database()                AS db,
           current_user                      AS usr,
           pg_is_in_recovery()               AS in_recovery,
           left(version(), 60)               AS version`,
      );
      const row = result.rows[0];
      if (row) {
        logger.info(
          {
            pgServerIP:  row.server,
            database:    row.db,
            pgUser:      row.usr,
            isReplica:   row.in_recovery,
            pgVersion:   row.version,
          },
          row.in_recovery
            ? "[DB STARTUP] ⚠️  Connected to a READ REPLICA — writes will not persist!"
            : "[DB STARTUP] ✅ Connected to PRIMARY — writes should persist",
        );
      }
    } finally {
      client.release();
    }
  } catch (err: any) {
    logger.error({ err: err.message }, "[DB STARTUP] Could not connect to database at startup");
  } finally {
    await pool.end();
  }
}

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");

  // Fire-and-forget: diagnostic runs after the server is accepting connections.
  runDbStartupDiagnostic().catch((e) =>
    logger.error({ err: e.message }, "[DB STARTUP] Unexpected diagnostic error"),
  );
});
