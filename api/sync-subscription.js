const Stripe = require("stripe");
const { createClient } = require("@supabase/supabase-js");

const ACTIVE_STATUSES = new Set(["active", "trialing"]);

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

function toIsoOrNull(epochSeconds) {
  if (!epochSeconds) return null;
  return new Date(epochSeconds * 1000).toISOString();
}

function pickBestSubscription(subscriptions) {
  if (!subscriptions || subscriptions.length === 0) return null;
  const priority = {
    active: 5,
    trialing: 4,
    past_due: 3,
    unpaid: 2,
    incomplete: 1,
    incomplete_expired: 0,
    canceled: -1
  };
  const sorted = [...subscriptions].sort((a, b) => {
    const pa = priority[a.status] ?? -2;
    const pb = priority[b.status] ?? -2;
    if (pa !== pb) return pb - pa;
    return (b.created || 0) - (a.created || 0);
  });
  return sorted[0];
}

module.exports = async (req, res) => {
  if (req.method !== "POST") return json(res, 405, { error: "Method not allowed" });

  const {
    SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY,
    STRIPE_SECRET_KEY
  } = process.env;

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !STRIPE_SECRET_KEY) {
    return json(res, 500, { error: "Server configuration missing (Supabase/Stripe env vars)." });
  }

  const stripe = new Stripe(STRIPE_SECRET_KEY);
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

  if (customerError) {
    return json(res, 500, {
      error: "Billing tables not found. Run supabase-billing.sql in Supabase SQL Editor."
    });
  }

  let stripeCustomerId = customerRow?.stripe_customer_id || null;

  // If there is no mapping yet, try to find a matching Stripe customer by email.
  if (!stripeCustomerId && user.email) {
    const customers = await stripe.customers.list({ email: user.email, limit: 10 });
    if (customers.data.length > 0) {
      stripeCustomerId = customers.data[0].id;
      await supabaseAdmin.from("billing_customers").upsert(
        {
          user_id: user.id,
          stripe_customer_id: stripeCustomerId,
          updated_at: new Date().toISOString()
        },
        { onConflict: "user_id" }
      );
    }
  }

  if (!stripeCustomerId) {
    await supabaseAdmin.from("billing_subscriptions").upsert(
      {
        user_id: user.id,
        status: "inactive",
        updated_at: new Date().toISOString()
      },
      { onConflict: "user_id" }
    );
    return json(res, 200, { active: false, status: "inactive" });
  }

  const subscriptions = await stripe.subscriptions.list({
    customer: stripeCustomerId,
    status: "all",
    limit: 20
  });

  const best = pickBestSubscription(subscriptions.data);
  if (!best) {
    await supabaseAdmin.from("billing_subscriptions").upsert(
      {
        user_id: user.id,
        status: "inactive",
        updated_at: new Date().toISOString()
      },
      { onConflict: "user_id" }
    );
    return json(res, 200, { active: false, status: "inactive" });
  }

  await supabaseAdmin.from("billing_subscriptions").upsert(
    {
      user_id: user.id,
      stripe_subscription_id: best.id,
      stripe_price_id: best.items?.data?.[0]?.price?.id || null,
      status: best.status || "inactive",
      current_period_end: toIsoOrNull(best.current_period_end),
      cancel_at_period_end: !!best.cancel_at_period_end,
      updated_at: new Date().toISOString()
    },
    { onConflict: "user_id" }
  );

  return json(res, 200, {
    active: ACTIVE_STATUSES.has(best.status || "inactive"),
    status: best.status || "inactive"
  });
};
