(function () {
  var form = document.getElementById("loginForm");
  var statusMessage = document.getElementById("statusMessage");
  var loginBtn = document.getElementById("loginBtn");
  var mfaSection = document.getElementById("mfaSection");
  var mfaForm = document.getElementById("mfaForm");
  var mfaCodeInput = document.getElementById("mfaCode");
  var mfaVerifyBtn = document.getElementById("mfaVerifyBtn");
  var resendBtn = document.getElementById("resendBtn");
  var portalTypeInput = document.getElementById("portalType");

  // Portal toggle
  var clientToggle = document.getElementById("clientToggle");
  var consultantToggle = document.getElementById("consultantToggle");
  var loginHeading = document.getElementById("loginHeading");
  var loginSub = document.getElementById("loginSub");
  var loginLinks = document.getElementById("loginLinks");

  function setPortalType(type) {
    portalTypeInput.value = type;
    if (type === "consultant") {
      clientToggle.classList.remove("active");
      consultantToggle.classList.add("active");
      loginHeading.textContent = "Consultant Sign in";
      loginSub.textContent = "Access the AdvisaStacks Consultant Portal.";
      loginLinks.innerHTML = 'No account yet? <a href="./signup.html?portal=consultant">Create a profile</a> | <a href="./home.html">Learn more</a>';
    } else {
      consultantToggle.classList.remove("active");
      clientToggle.classList.add("active");
      loginHeading.textContent = "Sign in";
      loginSub.textContent = "Use your AdvisaStacks account credentials.";
      loginLinks.innerHTML = 'No account yet? <a href="./signup.html">Create account</a> | <a href="./home.html">Learn more</a>';
    }
  }

  if (clientToggle && consultantToggle) {
    clientToggle.addEventListener("click", function () { setPortalType("client"); });
    consultantToggle.addEventListener("click", function () { setPortalType("consultant"); });
  }

  // Check URL params for portal type
  var urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get("portal") === "consultant") {
    setPortalType("consultant");
  }

  // Allowed redirect targets after login (to prevent open redirect)
  var ALLOWED_REDIRECTS = { billing: "./billing.html" };

  function getClientRedirectUrl() {
    var redirect = urlParams.get("redirect");
    if (redirect && ALLOWED_REDIRECTS[redirect]) {
      return ALLOWED_REDIRECTS[redirect];
    }
    return "./index.html";
  }

  // After 2FA, consultant logins check access and may redirect to setup
  function resolveConsultantRedirect(token) {
    return fetch("/api/check-consultant-access", {
      method: "POST",
      headers: { Authorization: "Bearer " + token }
    })
      .then(function (r) { return r.json(); })
      .then(function (result) {
        if (result.access) return "./consultant-portal.html";
        if (result.hasPendingInvite) return "./consultant-setup.html";
        // No access — still send to portal, it will show access denied
        return "./consultant-portal.html";
      })
      .catch(function () {
        return "./consultant-portal.html";
      });
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

  var supabaseClient = null;
  if (!missingConfig) {
    supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    supabaseClient.auth.getSession().then(function (result) {
      if (result.data && result.data.session) {
        checkIfAlreadyVerified(result.data.session.access_token);
      }
    });
  }

  function checkIfAlreadyVerified(token) {
    fetch("/api/verify-login-code", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + token,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ check: true })
    })
      .then(function (r) { return r.json(); })
      .then(function (result) {
        if (result.verified) {
          if (portalTypeInput.value === "consultant") {
            resolveConsultantRedirect(token).then(function (url) {
              window.location.replace(url);
            });
          } else {
            window.location.replace(getClientRedirectUrl());
          }
        }
      })
      .catch(function () {});
  }

  function sendCode(token) {
    return fetch("/api/send-login-code", {
      method: "POST",
      headers: { Authorization: "Bearer " + token }
    }).then(function (r) {
      if (r.ok) return { ok: true };
      return r.json().then(function (body) {
        return { ok: false, error: body.error };
      }).catch(function () {
        return { ok: false, error: null };
      });
    });
  }

  function verifyCode(token, code) {
    return fetch("/api/verify-login-code", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + token,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ code: code })
    }).then(function (r) { return r.json(); });
  }

  var activeToken = null;

  function showCodeEntry(token) {
    activeToken = token;
    form.style.display = "none";
    mfaSection.style.display = "block";
    mfaCodeInput.value = "";
    mfaCodeInput.focus();
  }

  if (resendBtn) {
    resendBtn.addEventListener("click", function () {
      if (!activeToken) return;
      resendBtn.disabled = true;
      setStatus("Sending a new code...", "");
      sendCode(activeToken).then(function (result) {
        if (result.ok) {
          setStatus("New code sent to your email.", "ok");
        } else {
          setStatus(result.error || "Failed to resend code. Try again.", "error");
        }
        resendBtn.disabled = false;
      });
    });
  }

  mfaForm.addEventListener("submit", function (e) {
    e.preventDefault();
    if (!activeToken) return;
    mfaVerifyBtn.disabled = true;
    setStatus("", "");

    var code = mfaCodeInput.value.trim();
    if (!code || code.length !== 6) {
      setStatus("Please enter the 6-digit code from your email.", "error");
      mfaVerifyBtn.disabled = false;
      return;
    }

    verifyCode(activeToken, code).then(function (result) {
      if (result.verified) {
        setStatus("Verified! Redirecting...", "ok");
        if (portalTypeInput.value === "consultant") {
          resolveConsultantRedirect(activeToken).then(function (url) {
            window.location.replace(url);
          });
        } else {
          window.location.replace(getClientRedirectUrl());
        }
        return;
      }
      setStatus(result.error || "Invalid or expired code. Please try again.", "error");
      mfaVerifyBtn.disabled = false;
      mfaCodeInput.value = "";
      mfaCodeInput.focus();
    });
  });

  form.addEventListener("submit", function (event) {
    event.preventDefault();
    setStatus("", "");
    if (missingConfig) return;
    loginBtn.disabled = true;

    var email = document.getElementById("email").value.trim();
    var password = document.getElementById("password").value;

    var supabase = supabaseClient || window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

    supabase.auth.signInWithPassword({ email: email, password: password }).then(function (result) {
      if (result.error) {
        setStatus(result.error.message, "error");
        loginBtn.disabled = false;
        return;
      }

      var token = result.data.session.access_token;
      setStatus("Sending verification code to your email...", "");

      sendCode(token).then(function (result) {
        if (!result.ok) {
          setStatus(result.error || "Failed to send verification code. Please try again.", "error");
          loginBtn.disabled = false;
          return;
        }
        setStatus("A 6-digit code has been sent to your email.", "ok");
        showCodeEntry(token);
      });
    });
  });
})();
