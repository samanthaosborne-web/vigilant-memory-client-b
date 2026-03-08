(function () {
  const form = document.getElementById("resetPasswordForm");
  const statusMessage = document.getElementById("statusMessage");
  const resetBtn = document.getElementById("resetBtn");

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
    resetBtn.disabled = true;
    return;
  }

  const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  supabase.auth.getSession().then(({ data, error }) => {
    if (error || !data.session) {
      setStatus(
        "Invalid or expired reset link. Please request a new password reset email.",
        "error"
      );
      resetBtn.disabled = true;
    }
  });

  form.addEventListener("submit", async function (event) {
    event.preventDefault();
    setStatus("", "");
    resetBtn.disabled = true;

    const newPassword = document.getElementById("newPassword").value;
    const confirmPassword = document.getElementById("confirmPassword").value;

    if (newPassword !== confirmPassword) {
      setStatus("Passwords do not match.", "error");
      resetBtn.disabled = false;
      return;
    }

    if (newPassword.length < 8) {
      setStatus("Password must be at least 8 characters.", "error");
      resetBtn.disabled = false;
      return;
    }

    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) {
      setStatus(error.message, "error");
      resetBtn.disabled = false;
      return;
    }

    setStatus("Password updated. Redirecting to login...", "ok");
    setTimeout(() => {
      window.location.replace("./login.html");
    }, 1200);
  });
})();
