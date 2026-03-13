const { createClient } = require("@supabase/supabase-js");

// POST /api/invite-consultant
// Body: { email: string }
// Auth: Bearer token — caller must have role='admin' or role='consultant' in memberships
//
// Flow:
// 1. Verify caller is authorized to invite
// 2. Upsert invite row in consultant_invites
// 3. Call Supabase admin inviteUserByEmail (sends magic link)
// 4. Return success

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

  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, APP_URL } = process.env;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return json(res, 500, { error: "Server configuration missing." });
  }

  const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false }
  });

  // Authenticate caller
  const authHeader = req.headers.authorization || "";
  if (!authHeader.startsWith("Bearer ")) {
    return json(res, 401, { error: "Unauthorized" });
  }
  const token = authHeader.slice("Bearer ".length);
  const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(token);
  if (userError || !userData.user) {
    return json(res, 401, { error: "Unauthorized" });
  }
  const caller = userData.user;

  // Check caller has admin or consultant role in memberships
  const { data: callerMembership, error: memberError } = await supabaseAdmin
    .from("memberships")
    .select("role, portal_access")
    .eq("user_id", caller.id)
    .maybeSingle();

  if (memberError || !callerMembership) {
    return json(res, 403, { error: "You do not have permission to invite consultants." });
  }

  if (!["admin", "consultant"].includes(callerMembership.role) || !callerMembership.portal_access) {
    return json(res, 403, { error: "You do not have permission to invite consultants." });
  }

  // Parse and validate input
  const body = parseBody(req);
  const email = (body.email || "").trim().toLowerCase();

  if (!email || !email.includes("@")) {
    return json(res, 400, { error: "A valid email address is required." });
  }

  // Check if there's already a pending invite for this email
  const { data: existingInvite } = await supabaseAdmin
    .from("consultant_invites")
    .select("id, status")
    .eq("email", email)
    .eq("status", "pending")
    .maybeSingle();

  if (existingInvite) {
    return json(res, 409, { error: "An invite is already pending for this email." });
  }

  // Check if this user already has consultant access
  const { data: existingUser } = await supabaseAdmin
    .from("memberships")
    .select("user_id, role, portal_access")
    .eq("role", "consultant")
    .eq("portal_access", true);

  if (existingUser && existingUser.length > 0) {
    // Look up if any of these users match the email
    for (const m of existingUser) {
      const { data: u } = await supabaseAdmin.auth.admin.getUserById(m.user_id);
      if (u && u.user && u.user.email && u.user.email.toLowerCase() === email) {
        return json(res, 409, { error: "This email already has consultant access." });
      }
    }
  }

  // Create the invite record
  const { error: insertError } = await supabaseAdmin
    .from("consultant_invites")
    .insert({
      email: email,
      invited_by: caller.id,
      status: "pending"
    });

  if (insertError) {
    return json(res, 500, { error: "Failed to create invite record: " + insertError.message });
  }

  // Send the invite via Supabase admin API
  // This creates the user in auth.users (if new) and sends a magic link email
  const baseUrl = (APP_URL || "https://advisastacks.com").replace(/\/$/, "");
  const redirectTo = baseUrl + "/consultant-setup.html";

  const { data: inviteData, error: inviteError } = await supabaseAdmin.auth.admin.inviteUserByEmail(
    email,
    {
      redirectTo: redirectTo,
      data: {
        account_type: "consultant",
        invited_by: caller.id
      }
    }
  );

  if (inviteError) {
    // If user already exists in auth, the invite fails. That's OK —
    // we still have the invite row. They can log in normally and we'll
    // check the invite on the consultant setup page.
    if (inviteError.message && inviteError.message.includes("already been registered")) {
      // Send a manual notification email instead
      try {
        const RESEND_API_KEY = process.env.RESEND_API_KEY;
        const FROM_EMAIL = process.env.FROM_EMAIL || "AdvisaStacks <noreply@advisastacks.com>";
        if (RESEND_API_KEY) {
          await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: {
              Authorization: "Bearer " + RESEND_API_KEY,
              "Content-Type": "application/json"
            },
            body: JSON.stringify({
              from: FROM_EMAIL,
              to: [email],
              subject: "You've been invited to the AdvisaStacks Consultant Portal",
              html: [
                '<div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px;">',
                '<h2 style="color:#e75a00;margin:0 0 12px;">AdvisaStacks</h2>',
                '<p>You\'ve been invited to join the <strong>Consultant Portal</strong>.</p>',
                '<p>Since you already have an AdvisaStacks account, just log in with the Consultant Portal option:</p>',
                '<a href="' + baseUrl + '/login.html?portal=consultant" style="display:inline-block;',
                'background:#e75a00;color:#fff;text-decoration:none;padding:12px 24px;border-radius:10px;',
                'font-weight:700;margin:16px 0;">Log in to Consultant Portal</a>',
                '<p style="color:#666;font-size:14px;">If you didn\'t expect this, you can ignore this email.</p>',
                '</div>'
              ].join("")
            })
          });
        }
      } catch (_emailErr) {
        // Non-fatal — invite row is created either way
      }

      return json(res, 200, {
        sent: true,
        note: "User already exists. Notification email sent. They can log in via Consultant Portal."
      });
    }

    // Actual error — clean up the invite row
    await supabaseAdmin
      .from("consultant_invites")
      .delete()
      .eq("email", email)
      .eq("status", "pending");

    return json(res, 500, { error: "Failed to send invite: " + inviteError.message });
  }

  return json(res, 200, { sent: true, userId: inviteData.user?.id || null });
};
