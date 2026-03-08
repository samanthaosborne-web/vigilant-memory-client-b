const Stripe = require("stripe");
const { createClient } = require("@supabase/supabase-js");

function json(res, status, payload) {
  res.status(status).json(payload);
}

function getBaseUrl(req) {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, "");
  const host = req.headers.host;
  const proto = req.headers["x-forwarded-proto"] || "https";
  return `${proto}://${host}`;
}

async function getAuthedUser(req, supabaseAdmin) {
  const authHeader = req.headers.authorization || "";
  if (!authHeader.startsWith("Bearer ")) return null;
  const token = authHeader.slice("Bearer ".length);
  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data.user) return null;
  return data.user;
}

module.exports = async (req, res) => {
  if (req.method !== "POST") return json(res, 405, { error: "Method not allowed" });

  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, STRIPE_SECRET_KEY } = process.env;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !STRIPE_SECRET_KEY) {
    return json(res, 500, { error: "Server configuration missing (Supabase/Stripe env vars)." });
  }

  const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
  const user = await getAuthedUser(req, supabaseAdmin);
  if (!user) return json(res, 401, { error: "Unauthorized" });

  const { data: customerRow, error: customerError } = await supabaseAdmin
    .from("billing_customers")
    .select("stripe_customer_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (customerError || !customerRow?.stripe_customer_id) {
    return json(res, 400, {
      error: "No Stripe customer found yet. Start a subscription first."
    });
  }

  const stripe = new Stripe(STRIPE_SECRET_KEY);
  const portal = await stripe.billingPortal.sessions.create({
    customer: customerRow.stripe_customer_id,
    return_url: `${getBaseUrl(req)}/billing.html`
  });

  return json(res, 200, { url: portal.url });
};
