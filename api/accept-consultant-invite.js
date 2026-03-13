const { createClient } = require("@supabase/supabase-js");

// POST /api/accept-consultant-invite
// Body: { displayName: string }
// Auth: Bearer token — user must have a pending invite matching their email
//
// Flow:
// 1. Get authenticated user
// 2. Look up pending invite for their email
// 3. Mark invite as accepted
// 4. Create or update membership row with role=consultant, portal_access=true
// 5. Update user metadata with display_name and account_type
// 6. Return success

function json(res, status, payload) {
  res.status(status).json(payload);
}

function parseBody(req) {
  if (!req.body) return {};
  if (typeof req.body === "string") {
    try { return JSON.parse(req.body); } catch (_) { return {}; }
  }
  return req.body;
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

  // Authenticate
  const authHeader = req.headers.authorization || "";
  if (!authHeader.startsWith("Bearer ")) {
    return json(res, 401, { error: "Unauthorized" });
  }
  const token = authHeader.slice("Bearer ".length);
  const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(token);
  if (userError || !userData.user) {
    return json(res, 401, { error: "Unauthorized" });
  }
  const user = userData.user;
  const userEmail = (user.email || "").toLowerCase();

  // Parse input
  const body = parseBody(req);
  const displayName = (body.displayName || "").trim();

  if (!displayName) {
    return json(res, 400, { error: "Display name is required." });
  }

  // Look up pending invite for this email
  const { data: invite, error: inviteError } = await supabaseAdmin
    .from("consultant_invites")
    .select("id, invited_by")
    .eq("email", userEmail)
    .eq("status", "pending")
    .maybeSingle();

  if (inviteError || !invite) {
    return json(res, 403, {
      error: "No pending consultant invite found for your email. Contact your administrator."
    });
  }

  // Mark invite as accepted
  await supabaseAdmin
    .from("consultant_invites")
    .update({
      status: "accepted",
      user_id: user.id,
      accepted_at: new Date().toISOString()
    })
    .eq("id", invite.id);

  // Create or update membership row
  const { error: membershipError } = await supabaseAdmin
    .from("memberships")
    .upsert(
      {
        user_id: user.id,
        role: "consultant",
        portal_access: true,
        display_name: displayName,
        invited_by: invite.invited_by,
        updated_at: new Date().toISOString()
      },
      { onConflict: "user_id" }
    );

  if (membershipError) {
    return json(res, 500, {
      error: "Failed to create membership: " + membershipError.message
    });
  }

  // Update user metadata so the app knows this is a consultant
  await supabaseAdmin.auth.admin.updateUserById(user.id, {
    user_metadata: {
      ...user.user_metadata,
      account_type: "consultant",
      display_name: displayName
    }
  });

  return json(res, 200, { accepted: true });
};
