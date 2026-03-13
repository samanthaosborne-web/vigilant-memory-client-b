function json(res, status, payload) {
  res.status(status).json(payload);
}

function parseBody(req) {
  if (!req.body) return {};
  if (typeof req.body === "string") {
    try { return JSON.parse(req.body); } catch (_) { return {}; }
  }
  return req.body;
}

function esc(v) {
  return String(v || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

module.exports = async (req, res) => {
  if (req.method !== "POST") return json(res, 405, { error: "Method not allowed" });

  const RESEND_API_KEY = process.env.RESEND_API_KEY;
  const FROM_EMAIL = process.env.FROM_EMAIL || "AdvisaStacks <noreply@advisastacks.com>";
  const extraToEmail = (process.env.FEEDBACK_TO_EMAIL || process.env.CUSTOM_IDEA_TO_EMAIL || "").trim();
  const recipients = Array.from(new Set(["info@advisastacks.com", extraToEmail].filter(Boolean)));

  if (!RESEND_API_KEY) return json(res, 500, { error: "Email service not configured." });

  const body = parseBody(req);
  const name = String(body.name || "").trim();
  const email = String(body.email || "").trim();
  const area = String(body.area || "General").trim();
  const type = String(body.type || "General feedback").trim();
  const message = String(body.message || "").trim();
  const page = String(body.page || "").trim();

  if (!message) return json(res, 400, { error: "Feedback message is required." });

  const subject = ("Feedback (" + type + "): " + message.replace(/\s+/g, " ").trim().slice(0, 70)).trim();
  const html = [
    '<div style="font-family:Arial,sans-serif;max-width:680px;margin:0 auto;padding:24px;color:#f1f5f9;">',
      '<h2 style="margin:0 0 12px;color:#e75a00;">New webapp feedback</h2>',
      '<p style="margin:0 0 6px;"><strong>Name:</strong> ' + esc(name || "Not provided") + "</p>",
      '<p style="margin:0 0 6px;"><strong>Email:</strong> ' + esc(email || "Not provided") + "</p>",
      '<p style="margin:0 0 6px;"><strong>Area:</strong> ' + esc(area) + "</p>",
      '<p style="margin:0 0 16px;"><strong>Type:</strong> ' + esc(type) + "</p>",
      '<p style="margin:0 0 8px;"><strong>Message</strong></p>',
      '<pre style="white-space:pre-wrap;background:#111a2c;border:1px solid #1e293b;border-radius:8px;padding:12px;margin:0 0 14px;">' + esc(message) + "</pre>",
      '<p style="margin:0;"><strong>Page:</strong> ' + esc(page || "Unknown") + "</p>",
    "</div>"
  ].join("");

  try {
    const resp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + RESEND_API_KEY,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: recipients,
        subject,
        html,
        reply_to: email && email.includes("@") ? email : undefined
      })
    });

    if (!resp.ok) {
      let details = "Failed to send feedback.";
      try {
        const payload = await resp.json();
        details = payload?.message || payload?.error || details;
      } catch (_err) {
        const raw = await resp.text().catch(() => "");
        if (raw) details = raw.slice(0, 200);
      }
      console.error("send-feedback failed", resp.status, details);
      return json(res, 500, { error: details });
    }

    return json(res, 200, { sent: true });
  } catch (error) {
    console.error("send-feedback exception", error);
    return json(res, 500, { error: error?.message || "Failed to send feedback." });
  }
};
