# AdvisaStacks Billing & 2FA Setup (Stripe + Supabase + Vercel)

This project now includes:

- `billing.html` / `billing.js` (plan selection + billing management)
- `api/create-checkout-session.js`
- `api/create-portal-session.js`
- `api/stripe-webhook.js`
- `api/sync-subscription.js` (on-demand Stripe -> Supabase sync for access checks)
- `api/send-login-code.js` (email 2FA code sender)
- `api/verify-login-code.js` (email 2FA code verifier + session check)
- `supabase-billing.sql` (billing tables + RLS)
- `supabase-2fa.sql` (email 2FA tables)

## 1) Stripe products/prices

In Stripe Dashboard:

1. Create product: **AdvisaStacks**
2. Create recurring prices:
   - Monthly: **AUD 9.99**
   - Annual: **AUD 99**
3. Copy both Price IDs (look like `price_...`)

## 2) Supabase SQL

Run these files in Supabase SQL Editor (in order):

1. `supabase-billing.sql` — creates `billing_customers` and `billing_subscriptions`
2. `supabase-2fa.sql` — creates `login_verification_codes` and `login_verifications`

## 3) Email service (Resend)

The 2FA system sends verification codes via [Resend](https://resend.com):

1. Create a free Resend account at https://resend.com
2. Add and verify your sending domain (e.g. `advisastacks.com`)
3. Create an API key
4. Add it to Vercel env vars (see below)

## 4) Vercel environment variables

Set these in Vercel Project -> Settings -> Environment Variables:

- `APP_URL` = `https://advisastacks.com` (or your current primary app URL)
- `SUPABASE_URL` = your Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY` = Supabase service role key (server only)
- `STRIPE_SECRET_KEY` = Stripe secret key
- `STRIPE_WEBHOOK_SECRET` = Stripe webhook signing secret
- `STRIPE_PRICE_MONTHLY` = Stripe monthly price ID
- `STRIPE_PRICE_ANNUAL` = Stripe annual price ID
- `RESEND_API_KEY` = Resend API key (for sending 2FA emails)
- `FROM_EMAIL` = sender address, e.g. `AdvisaStacks <noreply@advisastacks.com>`

## 6) Stripe webhook endpoint

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

## 7) Access behavior

Every login requires two factors:

1. **Password** — the user's email + password
2. **Email code** — a 6-digit code sent to their email on each login

This prevents credential sharing — even if someone shares their password,
the other person still needs access to the email inbox to get the code.

Access flow:

- Unauthenticated users -> redirected to `login.html`
- Authenticated but not 2FA-verified -> redirected to `login.html`
- 2FA-verified but unpaid users -> redirected to `billing.html`
- 2FA-verified + active/trialing subscribers -> can access `index.html`

## 8) Test flow

1. Sign up a user
2. Log in with email + password
3. Check email for 6-digit code
4. Enter code on login page
5. Confirm redirect to `billing.html`
6. Start test checkout for monthly/annual
7. After successful payment, confirm:
   - `billing_subscriptions.status` is `active` (or `trialing`)
8. Open app and verify access is granted

## 9) If webhook retries failed previously

If you created subscriptions from Stripe Dashboard before webhook setup was correct, use the app flow:

1. Log in (with email + password + 2FA code)
2. Open `billing.html`
3. Wait a few seconds for sync (or refresh once)

`api/sync-subscription.js` will try to map customer by user email and update `billing_subscriptions`.

