(function () {
  const statusPill = document.getElementById("statusPill");
  const messageEl = document.getElementById("billingMessage");
  const monthlyBtn = document.getElementById("monthlyBtn");
  const annualBtn = document.getElementById("annualBtn");
  const manageBtn = document.getElementById("manageBtn");
  const openAppBtn = document.getElementById("openAppBtn");
  const logoutBtn = document.getElementById("logoutBtn");

  const ACTIVE_STATUSES = new Set(["active", "trialing"]);

  function setMessage(message, type) {
    messageEl.textContent = message;
    messageEl.className = "message " + (type || "");
  }

  function setStatus(text, isActive) {
    statusPill.textContent = text;
    statusPill.className = "status-pill " + (isActive ? "active" : "inactive");
  }

  function getConfig() {
    const SUPABASE_URL = window.SUPABASE_URL || "";
    const SUPABASE_ANON_KEY = window.SUPABASE_ANON_KEY || "";
    const missingConfig =
      !SUPABASE_URL ||
      !SUPABASE_ANON_KEY ||
      SUPABASE_URL.includes("YOUR-PROJECT-ID") ||
      SUPABASE_ANON_KEY.includes("YOUR_SUPABASE_ANON_KEY");
    return { SUPABASE_URL, SUPABASE_ANON_KEY, missingConfig };
  }

  function readCheckoutMessage() {
    const checkoutState = new URLSearchParams(window.location.search).get("checkout");
    if (checkoutState === "success") setMessage("Payment completed. Syncing subscription status...", "ok");
    if (checkoutState === "cancel") setMessage("Checkout cancelled. No charge was made.", "error");
  }

  async function getUserAndSession(supabase) {
    const { data, error } = await supabase.auth.getSession();
    if (error || !data.session) return null;
    return data.session;
  }

  async function loadSubscriptionStatus(supabase, userId) {
    const { data, error } = await supabase
      .from("billing_subscriptions")
      .select("status,current_period_end")
      .eq("user_id", userId)
      .maybeSingle();

    if (error) {
      setStatus("Billing table not ready yet", false);
      setMessage("Run supabase-billing.sql in Supabase SQL Editor, then reload this page.", "error");
      return { active: false, rawStatus: null };
    }

    const status = data?.status || "inactive";
    const active = ACTIVE_STATUSES.has(status);
    if (active) {
      const suffix = data?.current_period_end ? ` (renews ${new Date(data.current_period_end).toLocaleDateString()})` : "";
      setStatus(`Subscription active: ${status}${suffix}`, true);
      setMessage("You can now open the app.", "ok");
    } else {
      setStatus("No active subscription", false);
    }
    return { active, rawStatus: status };
  }

  async function syncSubscriptionFromServer(session) {
    const response = await fetch("/api/sync-subscription", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + session.access_token
      }
    });
    if (!response.ok) {
      let details = "Subscription sync failed.";
      try {
        const payload = await response.json();
        details = payload.error || details;
      } catch (_error) {
        // no-op
      }
      throw new Error(details);
    }
    return response.json();
  }

  async function startCheckout(plan, supabase) {
    setMessage("Opening Stripe checkout...", "");
    monthlyBtn.disabled = true;
    annualBtn.disabled = true;
    try {
      const session = await getUserAndSession(supabase);
      if (!session) {
        window.location.replace("./login.html");
        return;
      }
      const response = await fetch("/api/create-checkout-session", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + session.access_token
        },
        body: JSON.stringify({ plan })
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || "Unable to start checkout");
      }
      window.location.href = payload.url;
    } catch (error) {
      setMessage(error.message || "Unable to start checkout", "error");
      monthlyBtn.disabled = false;
      annualBtn.disabled = false;
    }
  }

  async function openPortal(supabase) {
    setMessage("Opening Stripe billing portal...", "");
    try {
      const session = await getUserAndSession(supabase);
      if (!session) {
        window.location.replace("./login.html");
        return;
      }
      const response = await fetch("/api/create-portal-session", {
        method: "POST",
        headers: {
          Authorization: "Bearer " + session.access_token
        }
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Unable to open billing portal");
      window.location.href = payload.url;
    } catch (error) {
      setMessage(error.message || "Unable to open billing portal", "error");
    }
  }

  async function init() {
    readCheckoutMessage();
    const { SUPABASE_URL, SUPABASE_ANON_KEY, missingConfig } = getConfig();
    if (missingConfig) {
      setStatus("Supabase config missing", false);
      setMessage("Update auth-config.js with Supabase URL and publishable key.", "error");
      return;
    }

    const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    const session = await getUserAndSession(supabase);
    if (!session) {
      window.location.replace("./login.html");
      return;
    }

    try {
      const twoFaResp = await fetch("/api/verify-login-code", {
        method: "POST",
        headers: {
          Authorization: "Bearer " + session.access_token,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ check: true })
      });
      if (twoFaResp.ok) {
        const twoFaResult = await twoFaResp.json();
        if (!twoFaResult.verified) {
          window.location.replace("./login.html");
          return;
        }
      } else {
        window.location.replace("./login.html");
        return;
      }
    } catch (_twoFaError) {
      window.location.replace("./login.html");
      return;
    }

    try {
      await syncSubscriptionFromServer(session);
    } catch (error) {
      setMessage(error.message || "Unable to sync subscription status yet.", "error");
    }

    const { active } = await loadSubscriptionStatus(supabase, session.user.id);
    openAppBtn.disabled = !active;

    monthlyBtn.addEventListener("click", () => startCheckout("monthly", supabase));
    annualBtn.addEventListener("click", () => startCheckout("annual", supabase));
    manageBtn.addEventListener("click", () => openPortal(supabase));

    openAppBtn.addEventListener("click", () => {
      window.location.href = "./index.html";
    });

    logoutBtn.addEventListener("click", async () => {
      await supabase.auth.signOut();
      window.location.replace("./login.html");
    });
  }

  init();
})();
