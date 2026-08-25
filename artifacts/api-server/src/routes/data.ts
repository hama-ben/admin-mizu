import { Router } from "express";
import { createClient } from "@supabase/supabase-js";
import pg from "pg";
import type { PoolClient } from "pg";

const { Pool } = pg;

// Lazy singleton pool for direct atomic SQL against the Supabase PostgreSQL.
// Uses SUPABASE_DB_URL so it bypasses PostgREST and can run single-statement
// GREATEST() updates that are immune to read-then-write race conditions.
let _supabasePool: InstanceType<typeof Pool> | null = null;
function getSupabasePool(): InstanceType<typeof Pool> {
  if (!_supabasePool) {
    const url = process.env["SUPABASE_DB_URL"];
    if (!url) throw new Error("SUPABASE_DB_URL is not configured");
    _supabasePool = new Pool({ connectionString: url, ssl: { rejectUnauthorized: false } });
  }
  return _supabasePool;
}

const router = Router();

const SUPABASE_URL = "https://aeoyteruvcxqimwusrey.supabase.co";
const SERVICE_ROLE_KEY = process.env["SUPABASE_SERVICE_ROLE_KEY"];

if (!SERVICE_ROLE_KEY) {
  console.error("SUPABASE_SERVICE_ROLE_KEY is not set — data routes will fail");
}

function adminClient() {
  if (!SERVICE_ROLE_KEY) throw new Error("SUPABASE_SERVICE_ROLE_KEY not configured");
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
}

// ── SECURITY: require a valid, currently-signed-in Supabase Auth session ────
// on every /api/data/* route. Without this, anyone who can reach this server
// (curl, a script, etc.) could call these endpoints directly — approving
// drivers, extending subscriptions, rejecting payments — even with zero
// access to the admin panel's UI/login screen. The frontend login screen
// alone is NOT sufficient protection; it only guards the UI, not this API.
router.use(async (req, res, next) => {
  const authHeader = req.headers.authorization ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;

  if (!token) {
    res.status(401).json({ error: "Missing admin session token" });
    return;
  }

  try {
    const { data, error } = await adminClient().auth.getUser(token);
    if (error || !data?.user) {
      res.status(401).json({ error: "Invalid or expired admin session" });
      return;
    }

    // ── SECURITY: verifying a Supabase session is NOT enough — the app has
    // 16+ real customer/driver accounts that also carry valid Supabase
    // sessions. Only allow requests through if the user is on the
    // admin_users allowlist. This is enforced here (service-role bypasses
    // RLS) in addition to the RLS policies used by direct PostgREST calls.
    const { rows } = await getSupabasePool().query(
      `SELECT 1 FROM public.admin_users WHERE user_id = $1`,
      [data.user.id],
    );
    if (rows.length === 0) {
      res.status(403).json({ error: "Not an authorized admin" });
      return;
    }

    // Attach the verified admin identity for any route that wants to log who
    // performed an action (e.g. which admin approved a payment).
    (req as any).adminUser = data.user;
    next();
  } catch {
    res.status(401).json({ error: "Could not verify admin session" });
  }
});

// Records an admin action into audit_log. Fire-and-forget-safe: logging
// failures are caught and logged to console, never allowed to fail the
// admin action itself.
async function logAdminAction(
  req: any,
  actionType: string,
  targetType: string,
  targetId: string | null,
  details?: Record<string, unknown>,
) {
  try {
    const admin = req.adminUser;
    await getSupabasePool().query(
      `INSERT INTO public.audit_log (admin_user_id, admin_email, action_type, target_type, target_id, details)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [admin?.id ?? null, admin?.email ?? null, actionType, targetType, targetId, details ? JSON.stringify(details) : null],
    );
  } catch (err: any) {
    console.error("[AUDIT LOG] FAILED to record action", "| actionType:", actionType, "| error:", err.message);
  }
}

// GET /api/data/dashboard
router.get("/dashboard", async (_req, res) => {
  try {
    const db = adminClient();

    const [
      { count: totalUsers },
      { count: totalConsumers },
      { count: totalDrivers },
      { count: ordersCompleted },
      { count: pendingVerifications },
      { count: activeDrivers },
    ] = await Promise.all([
      db.from("users").select("*", { count: "exact", head: true }),
      db.from("users").select("*", { count: "exact", head: true }).eq("user_type", "مستهلك"),
      db.from("users").select("*", { count: "exact", head: true }).eq("user_type", "سائق"),
      db.from("orders").select("*", { count: "exact", head: true }).eq("status", "تم التوصيل"),
      db.from("drivers").select("*", { count: "exact", head: true }).eq("status", "pending"),
      db.from("drivers").select("*", { count: "exact", head: true }).eq("status", "approved").eq("is_online", true),
    ]);

    const { data: completedOrders } = await db
      .from("orders")
      .select("total_price")
      .eq("status", "تم التوصيل");
    const totalRevenue = (completedOrders ?? []).reduce((s, o) => s + Number(o.total_price), 0);

    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const { data: recentOrders } = await db
      .from("orders")
      .select("created_at")
      .gte("created_at", since);

    const daily: Record<string, number> = {};
    (recentOrders ?? []).forEach((o) => {
      const d = o.created_at.slice(0, 10);
      daily[d] = (daily[d] || 0) + 1;
    });
    const chartData = Object.entries(daily)
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => a.date.localeCompare(b.date));

    res.json({
      totalUsers: totalUsers ?? 0,
      totalConsumers: totalConsumers ?? 0,
      totalDrivers: totalDrivers ?? 0,
      ordersCompleted: ordersCompleted ?? 0,
      pendingVerifications: pendingVerifications ?? 0,
      activeDrivers: activeDrivers ?? 0,
      totalRevenue,
      chartData,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/data/drivers/pending
router.get("/drivers/pending", async (_req, res) => {
  try {
    const db = adminClient();
    // Get all pending drivers from drivers table, join user info
    const { data: pendingDrivers, error } = await db
      .from("drivers")
      .select("*")
      .eq("status", "pending")
      .order("created_at", { ascending: false });

    if (error) throw error;
    if (!pendingDrivers || pendingDrivers.length === 0) {
      res.json([]);
      return;
    }

    const userIds = pendingDrivers.map((d: any) => d.user_id);
    const { data: users } = await db
      .from("users")
      .select("id, name, phone, wilaya, commune, account_status, user_type")
      .in("id", userIds);

    const usersMap = new Map((users ?? []).map((u: any) => [u.id, u]));

    const { data: details } = await db
      .from("driver_details")
      .select("*")
      .in("driver_id", userIds);
    const detailsMap = new Map((details ?? []).map((d: any) => [d.driver_id, d]));

    const enriched = pendingDrivers.map((d: any) => ({
      ...d,
      user: usersMap.get(d.user_id) ?? null,
      details: detailsMap.get(d.user_id) ?? null,
    }));

    res.json(enriched);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// NOTE: a legacy `PATCH /drivers/:userId/status` endpoint used to live here.
// It set account_status to the inconsistent literal "active" (instead of
// "approved", which is what the Mizu app and every other admin endpoint
// actually check for) and granted zero subscription days. It was unused by
// the current UI (driver-queue.tsx / rejected-drivers.tsx both call
// POST /drivers/:userId/approve instead) so it was removed outright rather
// than fixed, to eliminate the inconsistent status value at its source.
// If any existing rows in `users` still have account_status = 'active' from
// when this endpoint was in use, run a one-time migration to normalize them:
//   UPDATE public.users SET account_status = 'approved' WHERE account_status = 'active';

// GET /api/data/users
router.get("/users", async (req, res) => {
  try {
    const db = adminClient();
    const { role, search, wilaya, page = "0", pageSize = "20" } = req.query as Record<string, string>;

    let query = db.from("users").select("*", { count: "exact" });

    if (role === "driver") query = query.eq("user_type", "سائق");
    else if (role === "consumer") query = query.eq("user_type", "مستهلك");
    if (wilaya && wilaya !== "all") query = query.eq("wilaya", wilaya);
    if (search) query = query.or(`name.ilike.%${search}%,phone.ilike.%${search}%`);

    const p = parseInt(page, 10);
    const ps = parseInt(pageSize, 10);
    query = query
      .order("id", { ascending: false })
      .range(p * ps, (p + 1) * ps - 1);

    const { data, count, error } = await query;
    if (error) throw error;

    res.json({ data: data ?? [], count: count ?? 0 });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/data/orders
router.get("/orders", async (req, res) => {
  try {
    const db = adminClient();
    const { status, dateFrom, dateTo, page = "0", pageSize = "20" } = req.query as Record<string, string>;

    let query = db.from("orders").select("*", { count: "exact" });
    if (status && status !== "all") query = query.eq("status", status);
    if (dateFrom) query = query.gte("created_at", new Date(dateFrom).toISOString());
    if (dateTo) {
      const to = new Date(dateTo);
      to.setDate(to.getDate() + 1);
      query = query.lte("created_at", to.toISOString());
    }
    const p = parseInt(page, 10);
    const ps = parseInt(pageSize, 10);
    query = query
      .order("created_at", { ascending: false })
      .range(p * ps, (p + 1) * ps - 1);

    const { data: rawOrders, count, error } = await query;
    if (error) throw error;
    if (!rawOrders || rawOrders.length === 0) {
      res.json({ data: [], count: 0 });
      return;
    }

    const userIdSet = new Set<string>();
    rawOrders.forEach((o: any) => {
      if (o.user_id) userIdSet.add(o.user_id);
      if (o.driver_id) userIdSet.add(o.driver_id);
    });
    const { data: users } = await db
      .from("users")
      .select("id, name, phone, wilaya")
      .in("id", Array.from(userIdSet));
    const usersMap = new Map((users ?? []).map((u: any) => [u.id, u]));

    const data = rawOrders.map((o: any) => ({
      ...o,
      customerUser: o.user_id ? usersMap.get(o.user_id) ?? null : null,
      driverUser: o.driver_id ? usersMap.get(o.driver_id) ?? null : null,
    }));

    res.json({ data, count: count ?? 0 });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/data/payments
router.get("/payments", async (req, res) => {
  try {
    const db = adminClient();
    const { status } = req.query as { status?: string };

    let query = db.from("subscription_payments").select("*").order("created_at", { ascending: false });
    if (status) query = query.eq("status", status);

    const { data: payments, error } = await query;
    if (error) throw error;
    if (!payments || payments.length === 0) {
      res.json([]);
      return;
    }

    const driverIds = [...new Set(payments.map((p: any) => p.driver_id).filter(Boolean))];
    const { data: users } = await db
      .from("users")
      .select("id, name, phone, wilaya, subscription_expires_at")
      .in("id", driverIds);
    const usersMap = new Map((users ?? []).map((u: any) => [u.id, u]));

    const data = payments.map((p: any) => ({
      ...p,
      driver: usersMap.get(p.driver_id) ?? null,
    }));

    res.json(data);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/data/payments/summary
router.get("/payments/summary", async (_req, res) => {
  try {
    const db = adminClient();
    const { data: approved, error } = await db
      .from("subscription_payments")
      .select("driver_id, status")
      .eq("status", "approved");
    if (error) throw error;

    const driverIds = [...new Set((approved ?? []).map((p: any) => p.driver_id).filter(Boolean))];
    const { data: users } = await db
      .from("users")
      .select("id, wilaya")
      .in("id", driverIds);
    const usersMap = new Map((users ?? []).map((u: any) => [u.id, u]));

    const byWilaya: Record<string, number> = {};
    (approved ?? []).forEach((p: any) => {
      const w = usersMap.get(p.driver_id)?.wilaya || "Unknown";
      byWilaya[w] = (byWilaya[w] || 0) + 1;
    });

    res.json({
      approvedCount: approved?.length ?? 0,
      totalRevenue: (approved?.length ?? 0) * 1000,
      wilayaRevenue: Object.entries(byWilaya)
        .map(([wilaya, count]) => ({ wilaya, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 15),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/data/revenue
// Revenue is composed only of payments that have been approved.
router.get("/revenue", async (_req, res) => {
  try {
    const db = adminClient();
    const PAYMENT_AMOUNT = 1000;
    const { data: payments, error } = await db
      .from("subscription_payments")
      .select("id, driver_id, receipt_image, status, created_at, reviewed_at")
      .eq("status", "approved")
      .order("reviewed_at", { ascending: false });
    if (error) throw error;

    const driverIds = [...new Set((payments ?? []).map((payment: any) => payment.driver_id).filter(Boolean))];
    const { data: users, error: usersError } = driverIds.length
      ? await db.from("users").select("id, name, phone, email").in("id", driverIds)
      : { data: [], error: null };
    if (usersError) throw usersError;

    const usersById = new Map((users ?? []).map((user: any) => [user.id, user]));
    const transactions = (payments ?? []).map((payment: any) => ({
      id: payment.id,
      driver_id: payment.driver_id,
      transaction_number: payment.id,
      amount: PAYMENT_AMOUNT,
      receipt_image: payment.receipt_image,
      created_at: payment.created_at,
      approved_at: payment.reviewed_at,
      driver: usersById.get(payment.driver_id) ?? null,
    }));

    res.json({
      totalRevenue: transactions.reduce((sum, transaction) => sum + transaction.amount, 0),
      transactionCount: transactions.length,
      transactions,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/data/payments/:id/approve
//
// Fully atomic: everything runs inside one pg transaction on a single
// connection so there is no gap where payment is approved but subscription
// is not extended (or vice versa).
//
// Idempotency: SELECT … FOR UPDATE row-locks the payment row before touching
// it, then we check the affected rowcount of the payment UPDATE. If another
// concurrent request already flipped the status, our UPDATE hits 0 rows and
// we return 409 — zero subscription extension happens.
router.post("/payments/:id/approve", async (req, res) => {
  const { id } = req.params;
  let client: PoolClient | null = null;

  try {
    const pool = getSupabasePool();
    client = await pool.connect();
    await client.query("BEGIN");

    // Lock the payment row for this transaction. Any concurrent approval
    // attempt for the same payment will block here until we COMMIT/ROLLBACK.
    const lockResult = await client.query<{
      id: string;
      status: string;
      driver_id: string;
    }>(
      `SELECT id, status, driver_id
       FROM public.subscription_payments
       WHERE id = $1
       FOR UPDATE`,
      [id],
    );

    if (!lockResult.rows.length) {
      await client.query("ROLLBACK");
      return void res.status(404).json({ error: "Payment not found" });
    }

    const payment = lockResult.rows[0];

    if (payment.status === "approved") {
      await client.query("ROLLBACK");
      return void res.status(409).json({ error: "Payment already approved" });
    }

    // Flip payment status. We check rowCount as a final guard: if it is 0,
    // a concurrent transaction already changed the status between our SELECT
    // and now (shouldn't happen with FOR UPDATE, but defense in depth).
    const paymentUpdate = await client.query(
      `UPDATE public.subscription_payments
       SET status = 'approved', reviewed_at = NOW()
       WHERE id = $1 AND status = 'pending'`,
      [id],
    );

    if ((paymentUpdate.rowCount ?? 0) === 0) {
      await client.query("ROLLBACK");
      return void res.status(409).json({ error: "Payment already approved" });
    }

    // ── DIAGNOSTIC: read subscription_expires_at BEFORE the UPDATE ───────────
    // This tells us what value the GREATEST() will compute from.
    // If this shows NULL or a past date even after a previous approval wrote
    // a future date, it means something is resetting the column between requests
    // (a rule, a generated column, an external process, or a data model mismatch).
    const preUpdateResult = await client.query<{
      subscription_expires_at: string | null;
      account_status: string | null;
      rules: number;
    }>(
      `SELECT
         u.subscription_expires_at,
         u.account_status,
         (SELECT COUNT(*)::int FROM pg_rules WHERE tablename = 'users' AND schemaname = 'public') AS rules
       FROM public.users u
       WHERE u.id = $1`,
      [payment.driver_id],
    );

    const preVal = preUpdateResult.rows[0]?.subscription_expires_at ?? null;
    const preStatus = preUpdateResult.rows[0]?.account_status ?? null;
    const rulesCount = preUpdateResult.rows[0]?.rules ?? -1;

    console.log(
      "[PRE-UPDATE]",
      "| driver_id:", payment.driver_id,
      "| subscription_expires_at BEFORE update:", preVal,
      "| account_status BEFORE update:", preStatus,
      "| pg_rules on public.users:", rulesCount,
    );

    // Extend subscription by 30 base days + 3 gift days (33 total) from
    // whichever is later: the existing future expiry or right now (handles
    // fresh accounts where subscription_expires_at is NULL or in the past).
    // IMPORTANT: this must NOT touch account_status. Activating a driver's
    // account is exclusively the Driver Queue's job (POST /drivers/:id/approve)
    // — approving a payment for a driver still pending document review must
    // leave them pending, exactly as the confirmation dialog in the admin UI
    // already promises the admin.
    const RECEIPT_GIFT_DAYS = 3;
    const userUpdate = await client.query<{ subscription_expires_at: string }>(
      `UPDATE public.users
       SET
         subscription_expires_at = GREATEST(
           COALESCE(subscription_expires_at, NOW()),
           NOW()
         ) + ((30 + $2) * INTERVAL '1 day')
       WHERE id = $1
       RETURNING subscription_expires_at`,
      [payment.driver_id, RECEIPT_GIFT_DAYS],
    );

    if (!userUpdate.rows.length) {
      await client.query("ROLLBACK");
      throw new Error(`No users row matched driver_id=${payment.driver_id}`);
    }

    await client.query("COMMIT");

    const newExpiry = userUpdate.rows[0].subscription_expires_at;

    // ── DIAGNOSTIC: verify what the DB actually holds after COMMIT ──────────
    const [verifyResult, serverAddrResult] = await Promise.all([
      client.query<{ subscription_expires_at: string; account_status: string }>(
        `SELECT subscription_expires_at, account_status
         FROM public.users WHERE id = $1`,
        [payment.driver_id],
      ),
      client.query<{ server: string }>(
        `SELECT inet_server_addr()::text AS server`,
      ),
    ]);

    const actualExpiry = verifyResult.rows[0]?.subscription_expires_at;
    const pgServer = serverAddrResult.rows[0]?.server ?? "unknown";

    // Compare as ISO strings to avoid Date object reference false-positive.
    const toISO = (v: unknown) =>
      v instanceof Date ? v.toISOString() : String(v ?? "");
    const mismatch = toISO(actualExpiry) !== toISO(newExpiry);

    console.log(
      "[SUBSCRIPTION WRITE] payment approved",
      "| payment_id:", id,
      "| driver_id:", payment.driver_id,
      "| RETURNING value:", toISO(newExpiry),
      "| post-COMMIT SELECT:", toISO(actualExpiry),
      "| pg server IP:", pgServer,
      mismatch ? "| ⚠️  MISMATCH — value changed after COMMIT" : "| values match ✓",
    );

    await logAdminAction(req, "approve", "payment", id, { driverId: payment.driver_id, newExpiry });

    return void res.json({ ok: true, newExpiry, _debug: { preVal, actualExpiry, pgServer, mismatch } });
  } catch (err: any) {
    if (client) {
      await client.query("ROLLBACK").catch(() => {});
    }
    console.error("[SUBSCRIPTION WRITE] FAILED", "| payment_id:", id, "| error:", err.message);
    return void res.status(500).json({ error: err.message });
  } finally {
    // Always release — even if pool.connect() succeeded but a later step threw.
    if (client) client.release();
  }
});

// POST /api/data/payments/:id/reject
//
// Idempotency: SELECT … FOR UPDATE row-locks the payment row, then the UPDATE
// uses WHERE status = 'pending' as a guard. If the row was already processed
// (approved or rejected by a concurrent action), rowCount is 0 and we return
// 409 — no double-rejection is possible.
router.post("/payments/:id/reject", async (req, res) => {
  const { id } = req.params;
  let client: PoolClient | null = null;

  try {
    const pool = getSupabasePool();
    client = await pool.connect();

    // ── DIAGNOSTIC ① BEFORE ───────────────────────────────────────────────
    // Plain read outside any transaction — sees the last committed value.
    // Also retrieves driver_id from the payment row for subsequent reads.
    const preRead = await client.query<{
      driver_id: string | null;
      sub_exp: string | null;
    }>(
      `SELECT sp.driver_id,
              u.subscription_expires_at AS sub_exp
       FROM   public.subscription_payments sp
       LEFT JOIN public.users u ON u.id = sp.driver_id
       WHERE  sp.id = $1`,
      [id],
    );
    const driverIdForLog = preRead.rows[0]?.driver_id ?? "unknown";
    const subExpBefore   = preRead.rows[0]?.sub_exp   ?? null;
    console.log(
      "[REJECT DIAGNOSTIC] ① BEFORE txn",
      "| payment_id:", id,
      "| driver_id:", driverIdForLog,
      "| subscription_expires_at:", subExpBefore,
      "| server_time:", new Date().toISOString(),
    );

    // ── TRANSACTION (unchanged logic) ─────────────────────────────────────
    await client.query("BEGIN");

    // Lock the row. Any concurrent approve/reject for the same payment blocks here.
    const lockResult = await client.query<{
      id: string;
      status: string;
      driver_id: string | null;
    }>(
      `SELECT id, status, driver_id
       FROM public.subscription_payments
       WHERE id = $1
       FOR UPDATE`,
      [id],
    );

    if (!lockResult.rows.length) {
      await client.query("ROLLBACK");
      return void res.status(404).json({ error: "Payment not found" });
    }

    const payment = lockResult.rows[0];

    if (payment.status !== "pending") {
      await client.query("ROLLBACK");
      return void res.status(409).json({
        error: `Payment already ${payment.status}`,
      });
    }

    // WHERE status = 'pending' is a final defense-in-depth guard: if a
    // concurrent transaction somehow changed the status between our SELECT
    // and now (impossible with FOR UPDATE, but mirrors approve's pattern),
    // rowCount will be 0 and we surface a 409 rather than silently succeeding.
    const updateResult = await client.query(
      `UPDATE public.subscription_payments
       SET status = 'rejected', reviewed_at = NOW()
       WHERE id = $1 AND status = 'pending'`,
      [id],
    );

    if ((updateResult.rowCount ?? 0) === 0) {
      await client.query("ROLLBACK");
      return void res.status(409).json({ error: "Payment already processed" });
    }

    await client.query("COMMIT");

    // ── DIAGNOSTIC ② AFTER (same connection, post-COMMIT) ────────────────
    const postRead = await client.query<{ sub_exp: string | null }>(
      `SELECT subscription_expires_at AS sub_exp
       FROM   public.users
       WHERE  id = $1`,
      [driverIdForLog],
    );
    const subExpAfter = postRead.rows[0]?.sub_exp ?? null;
    console.log(
      "[REJECT DIAGNOSTIC] ② AFTER txn (same conn)",
      "| payment_id:", id,
      "| driver_id:", driverIdForLog,
      "| subscription_expires_at:", subExpAfter,
      "| changed:", subExpBefore !== subExpAfter,
      "| server_time:", new Date().toISOString(),
    );

    // ── DIAGNOSTIC ③ +3 s (fresh pool connection, fire-and-forget) ───────
    // Catches any async/delayed write that happens shortly after this
    // request completes — a different process reacting to the status change.
    setTimeout(() => {
      pool
        .query<{ sub_exp: string | null }>(
          `SELECT subscription_expires_at AS sub_exp FROM public.users WHERE id = $1`,
          [driverIdForLog],
        )
        .then((r) => {
          console.log(
            "[REJECT DIAGNOSTIC] ③ +3 s (fresh conn)",
            "| payment_id:", id,
            "| driver_id:", driverIdForLog,
            "| subscription_expires_at:", r.rows[0]?.sub_exp ?? null,
            "| server_time:", new Date().toISOString(),
          );
        })
        .catch((e: any) => {
          console.error("[REJECT DIAGNOSTIC] ③ +3 s query error:", e.message);
        });
    }, 3000);

    console.log("[PAYMENT REJECT] payment rejected", "| payment_id:", id);

    await logAdminAction(req, "reject", "payment", id, { driverId: driverIdForLog });

    return void res.json({ ok: true });
  } catch (err: any) {
    if (client) await client.query("ROLLBACK").catch(() => {});
    console.error("[PAYMENT REJECT] FAILED", "| payment_id:", id, "| error:", err.message);
    return void res.status(500).json({ error: err.message });
  } finally {
    if (client) client.release();
  }
});

// POST /api/data/drivers/:userId/reject
//
// Idempotency: SELECT … FOR UPDATE row-locks the user row before touching it,
// then the UPDATE uses WHERE account_status = 'pending' as a guard. If the
// driver was already approved or rejected by a concurrent action, rowCount is
// 0 and we return 409 — no double-rejection possible.
router.post("/drivers/:userId/reject", async (req, res) => {
  const { userId } = req.params;
  let client: PoolClient | null = null;

  try {
    const pool = getSupabasePool();
    client = await pool.connect();
    await client.query("BEGIN");

    // Lock the user row so a concurrent approve/reject for the same driver blocks.
    const lockResult = await client.query<{ id: string; account_status: string }>(
      `SELECT id, account_status
       FROM public.users
       WHERE id = $1
       FOR UPDATE`,
      [userId],
    );

    if (!lockResult.rows.length) {
      await client.query("ROLLBACK");
      return void res.status(404).json({ error: "Driver not found" });
    }

    const user = lockResult.rows[0];

    if (user.account_status !== "pending") {
      await client.query("ROLLBACK");
      return void res.status(409).json({
        error: `Driver already ${user.account_status}`,
      });
    }

    // WHERE account_status = 'pending' is defense-in-depth: if a concurrent
    // transaction changed the status between our SELECT and now (impossible
    // with FOR UPDATE, but mirrors the approve/reject pattern throughout),
    // rowCount will be 0 and we surface 409 rather than silently succeeding.
    const updateResult = await client.query(
      `UPDATE public.users
       SET account_status = 'rejected'
       WHERE id = $1 AND account_status = 'pending'`,
      [userId],
    );

    if ((updateResult.rowCount ?? 0) === 0) {
      await client.query("ROLLBACK");
      return void res.status(409).json({ error: "Driver already processed" });
    }

    await client.query("COMMIT");

    console.log(
      "[DRIVER REJECT] driver rejected",
      "| userId:", userId,
    );

    await logAdminAction(req, "reject", "driver", userId);

    return void res.json({ ok: true });
  } catch (err: any) {
    if (client) await client.query("ROLLBACK").catch(() => {});
    console.error("[DRIVER REJECT] FAILED", "| userId:", userId, "| error:", err.message);
    return void res.status(500).json({ error: err.message });
  } finally {
    if (client) client.release();
  }
});

// POST /api/data/drivers/:userId/approve
//
// Atomic, transaction-safe driver approval. All subscription date math runs
// entirely inside a single SQL UPDATE — the frontend never touches
// subscription_expires_at. Stacking is handled by GREATEST(COALESCE(...))
// so re-approving a rejected driver who has an existing future balance
// correctly adds on top rather than overwriting.
router.post("/drivers/:userId/approve", async (req, res) => {
  const { userId } = req.params;
  let client: PoolClient | null = null;

  try {
    const pool = getSupabasePool();
    client = await pool.connect();
    await client.query("BEGIN");

    // Lock the user row so concurrent approvals for the same driver block.
    const userResult = await client.query<{
      id: string;
      account_status: string;
      subscription_expires_at: string | null;
      first_approval_granted: boolean | null;
    }>(
      `SELECT id, account_status, subscription_expires_at, first_approval_granted
       FROM public.users
       WHERE id = $1
       FOR UPDATE`,
      [userId],
    );

    if (!userResult.rows.length) {
      await client.query("ROLLBACK");
      return void res.status(404).json({ error: "Driver not found" });
    }

    const user = userResult.rows[0];
    // Document approval always grants exactly 30 days — first-time or
    // re-approval after a rejection alike. (Previously this incorrectly
    // granted 32 days on first approval — fixed to match the spec exactly.)
    const daysToAdd = 30;

    console.log(
      "[DRIVER APPROVE PRE]",
      "| userId:", userId,
      "| first_approval_granted:", user.first_approval_granted,
      "| daysToAdd:", daysToAdd,
      "| subscription_expires_at BEFORE:", user.subscription_expires_at ?? "null",
    );

    // Single atomic statement: stacks days on top of any existing future
    // balance via GREATEST; falls back to NOW() when null or already expired.
    const updateResult = await client.query<{
      subscription_expires_at: string;
      account_status: string;
    }>(
      `UPDATE public.users
       SET
         account_status        = 'approved',
         subscription_expires_at = GREATEST(
           COALESCE(subscription_expires_at, NOW()),
           NOW()
         ) + ($1 * INTERVAL '1 day'),
         first_approval_granted = true
       WHERE id = $2
       RETURNING subscription_expires_at, account_status`,
      [daysToAdd, userId],
    );

    await client.query("COMMIT");

    const newExpiry = updateResult.rows[0].subscription_expires_at;

    console.log(
      "[DRIVER APPROVE]",
      "| userId:", userId,
      "| daysToAdd:", daysToAdd,
      "| newExpiry:", newExpiry,
      "| was first_approval_granted:", user.first_approval_granted,
    );

    await logAdminAction(req, "approve", "driver", userId, { daysToAdd, newExpiry });

    return void res.json({
      ok: true,
      newExpiry,
      daysToAdd,
      firstApprovalGranted: user.first_approval_granted,
    });
  } catch (err: any) {
    if (client) await client.query("ROLLBACK").catch(() => {});
    console.error("[DRIVER APPROVE] FAILED", "| userId:", userId, "| error:", err.message);
    return void res.status(500).json({ error: err.message });
  } finally {
    if (client) client.release();
  }
});

// ── User suspend / ban / unsuspend / unban ──────────────────────────────────
//
// Applies to any user_type (driver or consumer). Atomic, transaction-safe,
// row-locked exactly like the driver approve/reject endpoints above so
// concurrent admin actions on the same user can't race each other.
async function transitionUserStatus(
  userId: string,
  toStatus: "suspended" | "banned" | "approved",
  fromStatuses: string[],
  actionLabel: string,
  req: any,
  res: any,
) {
  let client: PoolClient | null = null;
  try {
    const pool = getSupabasePool();
    client = await pool.connect();
    await client.query("BEGIN");

    const lockResult = await client.query<{ id: string; account_status: string; name: string }>(
      `SELECT id, account_status, name
       FROM public.users
       WHERE id = $1
       FOR UPDATE`,
      [userId],
    );

    if (!lockResult.rows.length) {
      await client.query("ROLLBACK");
      return void res.status(404).json({ error: "User not found" });
    }

    const user = lockResult.rows[0];

    if (!fromStatuses.includes(user.account_status)) {
      await client.query("ROLLBACK");
      return void res.status(409).json({
        error: `Cannot ${actionLabel}: user is currently '${user.account_status}'`,
      });
    }

    const updateResult = await client.query(
      `UPDATE public.users
       SET account_status = $1
       WHERE id = $2 AND account_status = ANY($3::text[])`,
      [toStatus, userId, fromStatuses],
    );

    if ((updateResult.rowCount ?? 0) === 0) {
      await client.query("ROLLBACK");
      return void res.status(409).json({ error: "User status changed concurrently — please retry" });
    }

    await client.query("COMMIT");

    console.log(
      `[USER ${actionLabel.toUpperCase()}]`,
      "| userId:", userId,
      "| name:", user.name,
      "| by admin:", req.adminUser?.email ?? "unknown",
      "| newStatus:", toStatus,
    );

    await logAdminAction(req, actionLabel, "user", userId, { name: user.name, newStatus: toStatus });

    return void res.json({ ok: true, accountStatus: toStatus });
  } catch (err: any) {
    if (client) await client.query("ROLLBACK").catch(() => {});
    console.error(`[USER ${actionLabel.toUpperCase()}] FAILED`, "| userId:", userId, "| error:", err.message);
    return void res.status(500).json({ error: err.message });
  } finally {
    if (client) client.release();
  }
}

// POST /api/data/users/:id/suspend
router.post("/users/:id/suspend", async (req, res) => {
  await transitionUserStatus(
    req.params.id,
    "suspended",
    ["approved", "pending"],
    "suspend",
    req,
    res,
  );
});

// POST /api/data/users/:id/unsuspend
router.post("/users/:id/unsuspend", async (req, res) => {
  await transitionUserStatus(
    req.params.id,
    "approved",
    ["suspended"],
    "unsuspend",
    req,
    res,
  );
});

// POST /api/data/users/:id/ban
router.post("/users/:id/ban", async (req, res) => {
  await transitionUserStatus(
    req.params.id,
    "banned",
    ["approved", "pending", "suspended", "rejected"],
    "ban",
    req,
    res,
  );
});

// POST /api/data/users/:id/unban
router.post("/users/:id/unban", async (req, res) => {
  await transitionUserStatus(
    req.params.id,
    "approved",
    ["banned"],
    "unban",
    req,
    res,
  );
});

// GET /api/data/disputes
router.get("/disputes", async (_req, res) => {
  try {
    const db = adminClient();
    const { data, error } = await db
      .from("ratings")
      .select("id, rated_user_id, stars, dispute_reason, comment, is_disputed, created_at")
      .eq("is_disputed", true)
      .order("created_at", { ascending: false });
    if (error) throw error;
    if (!data || data.length === 0) {
      res.json([]);
      return;
    }

    const driverIds = [...new Set(data.map((d: any) => d.rated_user_id).filter(Boolean))];
    const { data: users } = await db
      .from("users")
      .select("id, name, phone, wilaya, user_type")
      .in("id", driverIds);
    const usersMap = new Map((users ?? []).map((u: any) => [u.id, u]));

    res.json(data.map((d: any) => ({
      id: d.id,
      driver_id: d.rated_user_id,
      rating: d.stars,
      comment: d.dispute_reason ?? d.comment ?? null,
      wilaya: usersMap.get(d.rated_user_id)?.wilaya ?? null,
      status: "pending",
      created_at: d.created_at,
      user: usersMap.get(d.rated_user_id) ?? null,
    })));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/data/disputes/:id
router.patch("/disputes/:id", async (req, res) => {
  try {
    const db = adminClient();
    const { status } = req.body;
    // resolved/dismissed → mark is_disputed=false to remove from queue.
    // Add dispute_status column via migration for persistent status tracking.
    const update = status !== "pending" ? { is_disputed: false } : {};
    const { error } = await db
      .from("ratings")
      .update(update)
      .eq("id", req.params.id);
    if (error) throw error;
    await logAdminAction(req, "resolve", "dispute", req.params.id, { status });
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/data/disputes/pending-count
router.get("/disputes/pending-count", async (_req, res) => {
  try {
    const db = adminClient();
    const { count, error } = await db
      .from("ratings")
      .select("*", { count: "exact", head: true })
      .eq("is_disputed", true);
    if (error) throw error;
    res.json({ count: count ?? 0 });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/data/announcements
router.get("/announcements", async (_req, res) => {
  try {
    const db = adminClient();
    const { data, error } = await db
      .from("announcements")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw error;
    res.json(data ?? []);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/data/announcements
router.post("/announcements", async (req, res) => {
  try {
    const db = adminClient();
    const { title, content, badge_text, target_audience } = req.body;
    const { data, error } = await db
      .from("announcements")
      .insert({ title, content, badge_text, target_audience, is_active: true })
      .select()
      .single();
    if (error) throw error;
    await logAdminAction(req, "create", "announcement", data?.id ?? null, { title, target_audience });
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/data/audit-log
router.get("/audit-log", async (req, res) => {
  try {
    const { page = "0", pageSize = "50" } = req.query as Record<string, string>;
    const p = parseInt(page, 10);
    const ps = parseInt(pageSize, 10);

    const pool = getSupabasePool();
    const [dataResult, countResult] = await Promise.all([
      pool.query(
        `SELECT id, admin_user_id, admin_email, action_type, target_type, target_id, details, created_at
         FROM public.audit_log
         ORDER BY created_at DESC
         LIMIT $1 OFFSET $2`,
        [ps, p * ps],
      ),
      pool.query(`SELECT COUNT(*)::int AS count FROM public.audit_log`),
    ]);

    res.json({ data: dataResult.rows, count: countResult.rows[0]?.count ?? 0 });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── Driver suspension requests ──────────────────────────────────────────────
router.get("/suspension-requests", async (_req, res) => {
  try {
    const db = adminClient();
    const { data, error } = await db
      .from("driver_suspension_requests")
      .select("id, driver_id, request_type, reason, reason_text, status, created_at, reviewed_at, reviewed_by")
      .order("status", { ascending: true })
      .order("created_at", { ascending: false });
    if (error) throw error;
    const driverIds = [...new Set((data ?? []).map((item: any) => item.driver_id))];
    const { data: users, error: usersError } = driverIds.length
      ? await db.from("users").select("id, name, phone, wilaya, commune").in("id", driverIds)
      : { data: [], error: null };
    if (usersError) throw usersError;
    const usersById = new Map((users ?? []).map((user: any) => [user.id, user]));
    res.json((data ?? []).map((item: any) => ({ ...item, driver: usersById.get(item.driver_id) ?? null })));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/suspension-requests/pending-count", async (_req, res) => {
  try {
    const { count, error } = await adminClient()
      .from("driver_suspension_requests")
      .select("*", { count: "exact", head: true })
      .eq("status", "pending");
    if (error) throw error;
    res.json({ count: count ?? 0 });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/suspension-requests/:id/decision", async (req, res) => {
  const { status } = req.body as { status?: string };
  if (status !== "approved" && status !== "rejected") {
    res.status(400).json({ error: "Decision must be approved or rejected" });
    return;
  }

  let client: PoolClient | null = null;
  try {
    client = await getSupabasePool().connect();
    await client.query("BEGIN");
    const requestResult = await client.query<{
      id: string;
      driver_id: string;
      request_type: "suspend" | "lift";
      reason: string;
      reason_text: string | null;
      status: string;
    }>(
      `SELECT id, driver_id, request_type, reason, reason_text, status
       FROM public.driver_suspension_requests
       WHERE id = $1
       FOR UPDATE`,
      [req.params.id],
    );
    const request = requestResult.rows[0];
    if (!request) {
      await client.query("ROLLBACK");
      res.status(404).json({ error: "Suspension request not found" });
      return;
    }
    if (request.status !== "pending") {
      await client.query("ROLLBACK");
      res.status(409).json({ error: "This suspension request was already reviewed" });
      return;
    }

    if (status === "approved") {
      const suspended = request.request_type === "suspend";
      const suspensionReason = suspended ? (request.reason === "other" ? request.reason_text : request.reason) : null;
      await client.query(
        `INSERT INTO public.driver_details (driver_id, is_suspended, suspension_reason)
         VALUES ($1, $2, $3)
         ON CONFLICT (driver_id) DO UPDATE
         SET is_suspended = EXCLUDED.is_suspended,
             suspension_reason = EXCLUDED.suspension_reason`,
        [request.driver_id, suspended, suspensionReason],
      );
    }

    const update = await client.query(
      `UPDATE public.driver_suspension_requests
       SET status = $1, reviewed_at = NOW(), reviewed_by = $2
       WHERE id = $3 AND status = 'pending'`,
      [status, (req as any).adminUser?.id ?? null, req.params.id],
    );
    if ((update.rowCount ?? 0) !== 1) {
      await client.query("ROLLBACK");
      res.status(409).json({ error: "Suspension request changed concurrently — please retry" });
      return;
    }
    await client.query("COMMIT");
    await logAdminAction(req, status === "approved" ? "approve" : "reject", "driver_suspension_request", req.params.id, {
      driverId: request.driver_id,
      requestType: request.request_type,
    });
    res.json({ ok: true, status });
  } catch (err: any) {
    if (client) await client.query("ROLLBACK").catch(() => {});
    console.error("[SUSPENSION REQUEST] FAILED", err.message);
    res.status(500).json({ error: err.message });
  } finally {
    client?.release();
  }
});

// Manually lift a driver's suspension from an approved suspension record.
// The historical request remains intact; only the driver's current state changes.
router.post("/suspension-requests/:id/lift", async (req, res) => {
  let client: PoolClient | null = null;
  try {
    client = await getSupabasePool().connect();
    await client.query("BEGIN");

    const requestResult = await client.query<{
      id: string;
      driver_id: string;
      request_type: "suspend" | "lift";
      status: string;
    }>(
      `SELECT id, driver_id, request_type, status
       FROM public.driver_suspension_requests
       WHERE id = $1
       FOR UPDATE`,
      [req.params.id],
    );
    const request = requestResult.rows[0];
    if (!request) {
      await client.query("ROLLBACK");
      res.status(404).json({ error: "Suspension request not found" });
      return;
    }
    if (request.request_type !== "suspend" || request.status !== "approved") {
      await client.query("ROLLBACK");
      res.status(409).json({ error: "Only an approved suspension can be lifted" });
      return;
    }

    const updateResult = await client.query(
      `UPDATE public.driver_details
       SET is_suspended = false, suspension_reason = NULL
       WHERE driver_id = $1`,
      [request.driver_id],
    );
    if ((updateResult.rowCount ?? 0) !== 1) {
      await client.query("ROLLBACK");
      res.status(404).json({ error: "Driver details not found" });
      return;
    }

    await client.query("COMMIT");
    await logAdminAction(req, "lift_suspension", "driver", request.driver_id, {
      requestId: request.id,
      source: "suspension_request_history",
    });
    res.json({ ok: true, driverId: request.driver_id });
  } catch (err: any) {
    if (client) await client.query("ROLLBACK").catch(() => {});
    console.error("[SUSPENSION LIFT] FAILED", err.message);
    res.status(500).json({ error: err.message });
  } finally {
    client?.release();
  }
});

export default router;
