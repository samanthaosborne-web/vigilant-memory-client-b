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

function parseBody(req) {
  if (!req.body) return {};
  if (typeof req.body === "string") {
    try {
      return JSON.parse(req.body);
    } catch (_e) {
      return {};
    }
  }
  return req.body;
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

  const {
    SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY,
    STRIPE_SECRET_KEY,
    STRIPE_PRICE_MONTHLY,
    STRIPE_PRICE_ANNUAL
  } = process.env;

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !STRIPE_SECRET_KEY) {
    return json(res, 500, { error: "Server configuration missing (Supabase/Stripe env vars)." });
  }

  const planToPrice = {
    monthly: STRIPE_PRICE_MONTHLY,
    annual: STRIPE_PRICE_ANNUAL
  };

  const body = parseBody(req);
  const plan = body.plan;
  if (!planToPrice[plan]) {
    return json(res, 400, { error: "Invalid plan. Expected monthly or annual." });
  }

  if (!planToPrice.monthly || !planToPrice.annual) {
    return json(res, 500, { error: "Stripe plan price IDs are not set." });
  }

  const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
  const user = await getAuthedUser(req, supabaseAdmin);
  if (!user) return json(res, 401, { error: "Unauthorized" });

  const stripe = new Stripe(STRIPE_SECRET_KEY);
  const appUrl = getBaseUrl(req);

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
  if (!stripeCustomerId) {
    const customer = await stripe.customers.create({
      email: user.email || undefined,
      metadata: { supabase_user_id: user.id }
    });
    stripeCustomerId = customer.id;

    const { error: upsertError } = await supabaseAdmin.from("billing_customers").upsert(
      {
        user_id: user.id,
        stripe_customer_id: stripeCustomerId,
        updated_at: new Date().toISOString()
      },
      { onConflict: "user_id" }
    );
    if (upsertError) {
      return json(res, 500, { error: "Unable to save billing customer mapping." });
    }
  }

  const checkout = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: stripeCustomerId,
    line_items: [{ price: planToPrice[plan], quantity: 1 }],
    allow_promotion_codes: true,
    success_url: `${appUrl}/billing.html?checkout=success`,
    cancel_url: `${appUrl}/billing.html?checkout=cancel`,
    client_reference_id: user.id,
    metadata: {
      supabase_user_id: user.id,
      plan
    },
    subscription_data: {
      metadata: {
        supabase_user_id: user.id,
        plan
      }
    }
  });

  return json(res, 200, { url: checkout.url });
};
