(function () {
  const form = document.getElementById("forgotPasswordForm");
  const statusMessage = document.getElementById("statusMessage");
  const sendResetBtn = document.getElementById("sendResetBtn");

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

    sendResetBtn.disabled = true;
    const email = document.getElementById("email").value.trim();
    const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin + "/reset-password.html"
    });

    if (error) {
      setStatus(error.message, "error");
      sendResetBtn.disabled = false;
      return;
    }

    setStatus("Reset link sent. Check your email inbox.", "ok");
    form.reset();
    sendResetBtn.disabled = false;
  });
})();
