const { createClient } = require("@supabase/supabase-js");

const MAX_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 15;

function json(res, status, payload) {
  res.status(status).json(payload);
}

function getSessionId(token) {
  try {
    const parts = token.split(".");
    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString());
    return payload.session_id || null;
  } catch (_) {
    return null;
  }
}

function parseBody(req) {
  if (!req.body) return {};
  if (typeof req.body === "string") {
    try { return JSON.parse(req.body); } catch (_) { return {}; }
  }
  return req.body;
}

async function getAuthedUserAndToken(req, supabaseAdmin) {
  const authHeader = req.headers.authorization || "";
  if (!authHeader.startsWith("Bearer ")) return { user: null, token: null };
  const token = authHeader.slice("Bearer ".length);
  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data.user) return { user: null, token: null };
  return { user: data.user, token };
}

async function getFailedAttempts(supabaseAdmin, userId) {
  const cutoff = new Date(Date.now() - LOCKOUT_MINUTES * 60 * 1000).toISOString();
  const { count } = await supabaseAdmin
    .from("login_verification_attempts")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("success", false)
    .gte("attempted_at", cutoff);
  return count || 0;
}

async function recordAttempt(supabaseAdmin, userId, success) {
  await supabaseAdmin
    .from("login_verification_attempts")
    .insert({ user_id: userId, success });
}

module.exports = async (req, res) => {
  if (req.method !== "POST") return json(res, 405, { error: "Method not allowed" });

  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return json(res, 500, { error: "Server configuration missing." });
  }

  const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false }
  });

  const { user, token } = await getAuthedUserAndToken(req, supabaseAdmin);
  if (!user) return json(res, 401, { error: "Unauthorized" });

  const sessionId = getSessionId(token);
  if (!sessionId) return json(res, 400, { error: "Invalid session." });

  const body = parseBody(req);

  if (body.check) {
    const { data: verification } = await supabaseAdmin
      .from("login_verifications")
      .select("verified_at")
      .eq("user_id", user.id)
      .eq("session_id", sessionId)
      .maybeSingle();

    return json(res, 200, { verified: !!verification });
  }

  const code = (body.code || "").trim();
  if (!code) return json(res, 400, { error: "Code is required." });

  const failedAttempts = await getFailedAttempts(supabaseAdmin, user.id);
  if (failedAttempts >= MAX_ATTEMPTS) {
    return json(res, 429, {
      error: "Too many failed attempts. Please wait " + LOCKOUT_MINUTES + " minutes and request a new code."
    });
  }

  const now = new Date().toISOString();

  const { data: codeRow, error: codeError } = await supabaseAdmin
    .from("login_verification_codes")
    .select("id")
    .eq("user_id", user.id)
    .eq("code", code)
    .eq("used", false)
    .gte("expires_at", now)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (codeError || !codeRow) {
    await recordAttempt(supabaseAdmin, user.id, false);
    const remaining = MAX_ATTEMPTS - failedAttempts - 1;
    const msg = remaining > 0
      ? "Invalid or expired code. " + remaining + " attempt(s) remaining."
      : "Too many failed attempts. Please wait " + LOCKOUT_MINUTES + " minutes and request a new code.";
    return json(res, 400, { error: msg });
  }

  await recordAttempt(supabaseAdmin, user.id, true);

  await supabaseAdmin
    .from("login_verification_codes")
    .update({ used: true })
    .eq("id", codeRow.id);

  await supabaseAdmin
    .from("login_verifications")
    .upsert(
      { user_id: user.id, session_id: sessionId, verified_at: now },
      { onConflict: "user_id,session_id" }
    );

  return json(res, 200, { verified: true });
};
