const { createClient } = require("@supabase/supabase-js");

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
    return json(res, 400, { error: "Invalid or expired code." });
  }

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
