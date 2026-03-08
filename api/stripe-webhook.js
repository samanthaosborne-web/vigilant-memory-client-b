const Stripe = require("stripe");
const { createClient } = require("@supabase/supabase-js");

function json(res, status, payload) {
  res.status(status).json(payload);
}

function toIsoOrNull(epochSeconds) {
  if (!epochSeconds) return null;
  return new Date(epochSeconds * 1000).toISOString();
}

async function readRawBody(req) {
  if (req.rawBody && Buffer.isBuffer(req.rawBody)) return req.rawBody;
  if (Buffer.isBuffer(req.body)) return req.body;
  if (typeof req.body === "string") return Buffer.from(req.body);
  if (req.body && typeof req.body === "object") return Buffer.from(JSON.stringify(req.body));
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

async function upsertSubscription(supabaseAdmin, userId, subscription) {
  const payload = {
    user_id: userId,
    stripe_subscription_id: subscription.id,
    stripe_price_id: subscription.items?.data?.[0]?.price?.id || null,
    status: subscription.status || "incomplete",
    current_period_end: toIsoOrNull(subscription.current_period_end),
    cancel_at_period_end: !!subscription.cancel_at_period_end,
    updated_at: new Date().toISOString()
  };

  await supabaseAdmin.from("billing_subscriptions").upsert(payload, { onConflict: "user_id" });
}

async function resolveUserIdByCustomer(supabaseAdmin, stripeCustomerId) {
  const { data } = await supabaseAdmin
    .from("billing_customers")
    .select("user_id")
    .eq("stripe_customer_id", stripeCustomerId)
    .maybeSingle();
  return data?.user_id || null;
}

module.exports = async (req, res) => {
  if (req.method !== "POST") return json(res, 405, { error: "Method not allowed" });

  const {
    SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY,
    STRIPE_SECRET_KEY,
    STRIPE_WEBHOOK_SECRET
  } = process.env;

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !STRIPE_SECRET_KEY || !STRIPE_WEBHOOK_SECRET) {
    return json(res, 500, { error: "Server webhook env vars are missing." });
  }

  const stripe = new Stripe(STRIPE_SECRET_KEY);
  const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false }
  });

  let event;
  let signatureVerificationError = null;
  let rawBody = null;
  try {
    const signature = req.headers["stripe-signature"];
    rawBody = await readRawBody(req);
    event = stripe.webhooks.constructEvent(rawBody, signature, STRIPE_WEBHOOK_SECRET);
  } catch (error) {
    signatureVerificationError = error;
  }

  // Fallback path for platforms where raw body parsing may mutate payload.
  // We recover by fetching the canonical event directly from Stripe by ID.
  if (!event) {
    try {
      let candidate = null;
      if (req.body && typeof req.body === "object" && req.body.id) {
        candidate = req.body;
      } else if (rawBody) {
        candidate = JSON.parse(rawBody.toString("utf8"));
      }
      if (!candidate?.id) throw signatureVerificationError || new Error("No event id found in payload");
      event = await stripe.events.retrieve(candidate.id);
    } catch (fallbackError) {
      const reason = signatureVerificationError?.message || fallbackError.message;
      return json(res, 400, { error: `Webhook signature verification failed: ${reason}` });
    }
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object;
        const userId = session.client_reference_id || session.metadata?.supabase_user_id || null;
        const stripeCustomerId = session.customer;

        if (userId && stripeCustomerId) {
          await supabaseAdmin.from("billing_customers").upsert(
            {
              user_id: userId,
              stripe_customer_id: stripeCustomerId,
              updated_at: new Date().toISOString()
            },
            { onConflict: "user_id" }
          );
        }

        if (userId && session.subscription) {
          const subscription = await stripe.subscriptions.retrieve(session.subscription);
          await upsertSubscription(supabaseAdmin, userId, subscription);
        }
        break;
      }

      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const subscription = event.data.object;
        const stripeCustomerId = subscription.customer;
        const userId = await resolveUserIdByCustomer(supabaseAdmin, stripeCustomerId);
        if (userId) {
          await upsertSubscription(supabaseAdmin, userId, subscription);
        }
        break;
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object;
        const stripeCustomerId = invoice.customer;
        const userId = await resolveUserIdByCustomer(supabaseAdmin, stripeCustomerId);
        if (userId) {
          await supabaseAdmin
            .from("billing_subscriptions")
            .update({ status: "past_due", updated_at: new Date().toISOString() })
            .eq("user_id", userId);
        }
        break;
      }

      default:
        break;
    }

    return json(res, 200, { received: true });
  } catch (error) {
    return json(res, 500, { error: `Webhook processing failed: ${error.message}` });
  }
};
