(function () {
  var form = document.getElementById("signupForm");
  var statusMessage = document.getElementById("statusMessage");
  var accountTypeInput = document.getElementById("accountType");
  var signupHeading = document.getElementById("signupHeading");
  var signupSub = document.getElementById("signupSub");
  var signupLinks = document.getElementById("signupLinks");

  // Detect consultant portal signup
  var urlParams = new URLSearchParams(window.location.search);
  var isConsultant = urlParams.get("portal") === "consultant";

  if (isConsultant && accountTypeInput) {
    accountTypeInput.value = "consultant";
    if (signupHeading) signupHeading.textContent = "Create your consultant profile";
    if (signupSub) signupSub.textContent = "Sign up to access the AdvisaStacks Consultant Portal.";
    if (signupLinks) signupLinks.innerHTML = 'Already have an account? <a href="./login.html?portal=consultant">Log in</a> | <a href="./home.html">Learn more</a>';
  }

  function setStatus(message, type) {
    statusMessage.textContent = message;
    statusMessage.className = "status " + (type || "");
  }

  var SUPABASE_URL = window.SUPABASE_URL || "";
  var SUPABASE_ANON_KEY = window.SUPABASE_ANON_KEY || "";
  var missingConfig =
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

    var firstName = document.getElementById("firstName").value.trim();
    var email = document.getElementById("email").value.trim();
    var password = document.getElementById("password").value;
    var confirmPassword = document.getElementById("confirmPassword").value;

    var legalAccepted = document.getElementById("legalDisclaimer").checked;
    var privacyAccepted = document.getElementById("privacyPolicy").checked;
    var advisaAccepted = document.getElementById("advisaDisclaimer").checked;
    var marketingOptIn = document.getElementById("marketingConsent").checked;
    var accountType = accountTypeInput ? accountTypeInput.value : "client";

    if (!firstName) {
      setStatus("Please enter your first name.", "error");
      return;
    }

    if (password !== confirmPassword) {
      setStatus("Passwords do not match.", "error");
      return;
    }

    if (!(legalAccepted && privacyAccepted && advisaAccepted)) {
      setStatus("Please accept all required checkbox items.", "error");
      return;
    }

    setStatus("Creating your account...", "");

    var supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

    var result = await supabase.auth.signUp({
      email: email,
      password: password,
      options: {
        emailRedirectTo: window.location.origin + (accountType === "consultant" ? "/login.html?portal=consultant" : "/login.html"),
        data: {
          first_name: firstName,
          account_type: accountType,
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

    if (result.error) {
      setStatus(result.error.message, "error");
      return;
    }

    try {
      await fetch("/api/send-welcome-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email, firstName: firstName })
      });
    } catch (_) {}

    window.location.href = "./signup-success.html";
  });
})();
