(function () {
  var form = document.getElementById("loginForm");
  var statusMessage = document.getElementById("statusMessage");
  var loginBtn = document.getElementById("loginBtn");
  var mfaSection = document.getElementById("mfaSection");
  var mfaForm = document.getElementById("mfaForm");
  var mfaCodeInput = document.getElementById("mfaCode");
  var mfaVerifyBtn = document.getElementById("mfaVerifyBtn");
  var resendBtn = document.getElementById("resendBtn");

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
          window.location.replace("./index.html");
        }
      })
      .catch(function () {});
  }

  function sendCode(token) {
    return fetch("/api/send-login-code", {
      method: "POST",
      headers: { Authorization: "Bearer " + token }
    }).then(function (r) { return r.ok; });
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
      sendCode(activeToken).then(function (ok) {
        if (ok) {
          setStatus("New code sent to your email.", "ok");
        } else {
          setStatus("Failed to resend code. Try again.", "error");
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
        window.location.href = "./index.html";
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

      sendCode(token).then(function (ok) {
        if (!ok) {
          setStatus("Failed to send verification code. Please try again.", "error");
          loginBtn.disabled = false;
          return;
        }
        setStatus("A 6-digit code has been sent to your email.", "ok");
        showCodeEntry(token);
      });
    });
  });
})();
