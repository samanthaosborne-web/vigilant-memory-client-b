(function () {
  const form = document.getElementById("signupForm");
  const statusMessage = document.getElementById("statusMessage");

  function setStatus(message, type) {
    statusMessage.textContent = message;
    statusMessage.className = "status " + (type || "");
  }

  const SUPABASE_URL = window.SUPABASE_URL || "";
  const SUPABASE_ANON_KEY = window.SUPABASE_ANON_KEY || "";
  const missingConfig =
    !SUPABASE_URL ||
    !SUPABASE_ANON_KEY ||
    SUPABASE_URL.includes("YOUR-PROJECT-ID") ||
    SUPABASE_ANON_KEY.includes("YOUR_SUPABASE_ANON_KEY");

  if (missingConfig) {
    setStatus(
      "Supabase is not configured yet. Update auth-config.js with your Supabase URL and anon key.",
      "error"
    );
  }

  form.addEventListener("submit", async function (event) {
    event.preventDefault();
    setStatus("", "");

    if (missingConfig) return;

    const email = document.getElementById("email").value.trim();
    const password = document.getElementById("password").value;
    const confirmPassword = document.getElementById("confirmPassword").value;

    const legalAccepted = document.getElementById("legalDisclaimer").checked;
    const privacyAccepted = document.getElementById("privacyPolicy").checked;
    const advisaAccepted = document.getElementById("advisaDisclaimer").checked;
    const marketingOptIn = document.getElementById("marketingConsent").checked;

    if (password !== confirmPassword) {
      setStatus("Passwords do not match.", "error");
      return;
    }

    if (!(legalAccepted && privacyAccepted && advisaAccepted)) {
      setStatus("Please accept all required checkbox items.", "error");
      return;
    }

    const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: window.location.origin + "/login.html",
        data: {
          legal_disclaimer_accepted: legalAccepted,
          privacy_policy_accepted: privacyAccepted,
          advisastack_disclaimer_accepted: advisaAccepted,
          marketing_opt_in: marketingOptIn,
          legal_disclaimer_version: "v1",
          privacy_policy_version: "v1",
          advisastack_disclaimer_version: "v1",
          marketing_consent_version: "v1",
          user_agent: navigator.userAgent
        }
      }
    });

    if (error) {
      setStatus(error.message, "error");
      return;
    }

    setStatus(
      "Account created. Check your email to verify your account before signing in.",
      "ok"
    );
    form.reset();
  });
})();
