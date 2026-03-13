const { createClient } = require("@supabase/supabase-js");

// POST /api/check-consultant-access
// Auth: Bearer token
//
// Returns:
// { access: true, role: "consultant", displayName: "..." } — has portal access
// { access: false, reason: "..." } — does not have portal access
// { access: false, hasPendingInvite: true } — has invite but hasn't completed setup
//
// This is the single source of truth for consultant portal access.
// It checks the memberships table, NOT billing_subscriptions.

function json(res, status, payload) {
  res.status(status).json(payload);
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

  // Check memberships table — this is the source of truth
  const { data: membership, error: memberError } = await supabaseAdmin
    .from("memberships")
    .select("role, portal_access, display_name")
    .eq("user_id", user.id)
    .maybeSingle();

  // Allow both consultant and admin roles to access the portal
  var hasAccess = !memberError && membership && membership.portal_access &&
    (membership.role === "consultant" || membership.role === "admin");

  if (hasAccess) {
    return json(res, 200, {
      access: true,
      role: membership.role,
      displayName: membership.display_name || user.user_metadata?.first_name || user.email
    });
  }

  // No membership — check if they have a pending invite (need to complete setup)
  const userEmail = (user.email || "").toLowerCase();
  const { data: pendingInvite } = await supabaseAdmin
    .from("consultant_invites")
    .select("id")
    .eq("email", userEmail)
    .eq("status", "pending")
    .maybeSingle();

  if (pendingInvite) {
    return json(res, 200, {
      access: false,
      hasPendingInvite: true,
      reason: "Please complete your consultant setup first."
    });
  }

  return json(res, 200, {
    access: false,
    reason: "You do not have consultant portal access."
  });
};
