const { createClient } = require("@supabase/supabase-js");

function json(res, status, payload) {
  res.status(status).json(payload);
}

async function getAuthedUser(req, supabaseAdmin) {
  const authHeader = req.headers.authorization || "";
  if (!authHeader.startsWith("Bearer ")) return null;
  const token = authHeader.slice("Bearer ".length);
  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data.user) return null;
  return data.user;
}

function generateCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

async function sendEmail(to, code) {
  const RESEND_API_KEY = process.env.RESEND_API_KEY;
  const FROM_EMAIL = process.env.FROM_EMAIL || "AdvisaStacks <noreply@advisastacks.com>";

  if (!RESEND_API_KEY) {
    console.log(`[2FA] No RESEND_API_KEY configured. Code for ${to}: ${code}`);
    return true;
  }

  const resp = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      from: FROM_EMAIL,
      to: [to],
      subject: "Your AdvisaStacks login code",
      html: [
        '<div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px;">',
        '<h2 style="color:#e75a00;margin:0 0 12px;">AdvisaStacks</h2>',
        "<p>Your login verification code is:</p>",
        '<div style="font-size:32px;font-weight:900;letter-spacing:0.2em;padding:16px;',
        'background:#f4f4f4;border-radius:8px;text-align:center;margin:16px 0;">',
        code,
        "</div>",
        '<p style="color:#666;font-size:14px;">This code expires in 10 minutes.',
        " If you didn't request this, you can ignore this email.</p>",
        "</div>"
      ].join("")
    })
  });

  return resp.ok;
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

  const user = await getAuthedUser(req, supabaseAdmin);
  if (!user) return json(res, 401, { error: "Unauthorized" });

  const code = generateCode();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

  await supabaseAdmin
    .from("login_verification_codes")
    .update({ used: true })
    .eq("user_id", user.id)
    .eq("used", false);

  const { error: insertError } = await supabaseAdmin
    .from("login_verification_codes")
    .insert({ user_id: user.id, code, expires_at: expiresAt });

  if (insertError) {
    return json(res, 500, {
      error: "Failed to generate verification code. Run supabase-2fa.sql in Supabase SQL Editor."
    });
  }

  const sent = await sendEmail(user.email, code);
  if (!sent) {
    return json(res, 500, { error: "Failed to send verification email." });
  }

  return json(res, 200, { sent: true });
};
