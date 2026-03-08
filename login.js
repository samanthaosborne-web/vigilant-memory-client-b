(function () {
  const form = document.getElementById("loginForm");
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

    const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      setStatus(error.message, "error");
      return;
    }

    window.location.href = "./index.html";
  });
})();
