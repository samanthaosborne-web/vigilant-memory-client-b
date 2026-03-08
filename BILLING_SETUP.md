# AdvisaStacks Billing Setup (Stripe + Supabase + Vercel)

This project now includes:

- `billing.html` / `billing.js` (plan selection + billing management)
- `api/create-checkout-session.js`
- `api/create-portal-session.js`
- `api/stripe-webhook.js`
- `supabase-billing.sql` (billing tables + RLS)

## 1) Stripe products/prices

In Stripe Dashboard:

1. Create product: **AdvisaStacks**
2. Create recurring prices:
   - Monthly: **AUD 9.99**
   - Annual: **AUD 99**
3. Copy both Price IDs (look like `price_...`)

## 2) Supabase SQL

Run this file in Supabase SQL Editor:

- `supabase-billing.sql`

This creates:

- `billing_customers`
- `billing_subscriptions`

and RLS policies for user-level reads.

## 3) Vercel environment variables

Set these in Vercel Project -> Settings -> Environment Variables:

- `APP_URL` = `https://advisastacks.com` (or your current primary app URL)
- `SUPABASE_URL` = your Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY` = Supabase service role key (server only)
- `STRIPE_SECRET_KEY` = Stripe secret key
- `STRIPE_WEBHOOK_SECRET` = Stripe webhook signing secret
- `STRIPE_PRICE_MONTHLY` = Stripe monthly price ID
- `STRIPE_PRICE_ANNUAL` = Stripe annual price ID

## 4) Stripe webhook endpoint

In Stripe Dashboard -> Developers -> Webhooks:

1. Add endpoint:
   - `https://advisastacks.com/api/stripe-webhook`
2. Subscribe to these events:
   - `checkout.session.completed`
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.payment_failed`
3. Copy signing secret to `STRIPE_WEBHOOK_SECRET`

## 5) Access behavior

- Unauthenticated users -> redirected to `login.html`
- Authenticated but unpaid users -> redirected to `billing.html`
- Active/trialing subscribers -> can access `index.html`

## 6) Test flow

1. Sign up a user
2. Log in
3. Confirm redirect to `billing.html`
4. Start test checkout for monthly/annual
5. After successful payment, confirm:
   - `billing_subscriptions.status` is `active` (or `trialing`)
6. Open app and verify access is granted

