const Stripe = require("stripe");
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

  const { data: subRow, error: subError } = await supabaseAdmin
    .from("billing_subscriptions")
    .select("stripe_subscription_id, status")
    .eq("user_id", user.id)
    .maybeSingle();

  if (subError || !subRow?.stripe_subscription_id) {
    return json(res, 400, { error: "No active subscription found." });
  }

  if (subRow.status !== "active" && subRow.status !== "trialing") {
    return json(res, 400, { error: "Subscription is not currently active." });
  }

  const stripe = new Stripe(STRIPE_SECRET_KEY);

  const subscription = await stripe.subscriptions.update(subRow.stripe_subscription_id, {
    cancel_at_period_end: true
  });

  await supabaseAdmin
    .from("billing_subscriptions")
    .update({ status: subscription.status })
    .eq("user_id", user.id);

  return json(res, 200, {
    message: "Membership will be cancelled at the end of your current billing period.",
    cancel_at: subscription.current_period_end
  });
};
