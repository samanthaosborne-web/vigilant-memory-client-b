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

function escapeHtml(value) {
  return String(value || "")
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
  const extraToEmail = (process.env.CUSTOM_IDEA_TO_EMAIL || "").trim();
  const recipients = Array.from(new Set(["info@advisastacks.com", extraToEmail].filter(Boolean)));

  if (!RESEND_API_KEY) {
    return json(res, 500, { error: "Email service not configured." });
  }

  const body = parseBody(req);
  const fields = body.fields && typeof body.fields === "object" ? body.fields : {};
  const oneoffPrompt = body.oneoffPrompt || "";
  const templatePrompt = body.templatePrompt || "";
  const suggestedFields = Array.isArray(body.suggestedFields) ? body.suggestedFields : [];
  const submittedAt = body.submittedAt || new Date().toISOString();
  const submitterEmail = body.submitterEmail || "Unknown";
  const submitterId = body.submitterId || "Unknown";

  const subjectTask = String(fields.problem || "Custom Builder submission")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
  const subject = "Custom Builder submission: " + subjectTask;

  const fieldRows = [
    ["Problem", fields.problem],
    ["Audience", fields.audience],
    ["Outcome", fields.outcome],
    ["Changes", fields.changes],
    ["Format", fields.format],
    ["Tone", fields.tone],
    ["Rules", fields.rules],
    ["Example input", fields.exampleInput],
    ["Example output", fields.exampleOutput],
    ["Suggested fields", suggestedFields.join(", ")]
  ];

  const rowsHtml = fieldRows
    .map(([label, value]) => {
      if (!value) return "";
      return (
        '<tr>' +
          '<td style="padding:8px 10px;border:1px solid #1e293b;background:#111a2c;font-weight:700;width:180px;">' + escapeHtml(label) + "</td>" +
          '<td style="padding:8px 10px;border:1px solid #1e293b;">' + escapeHtml(value) + "</td>" +
        "</tr>"
      );
    })
    .join("");

  const html = [
    '<div style="font-family:Arial,sans-serif;max-width:760px;margin:0 auto;padding:24px;color:#f1f5f9;">',
      '<h2 style="margin:0 0 12px;color:#e75a00;">New Custom Builder submission</h2>',
      '<p style="margin:0 0 6px;"><strong>Submitted:</strong> ' + escapeHtml(submittedAt) + "</p>",
      '<p style="margin:0 0 6px;"><strong>User email:</strong> ' + escapeHtml(submitterEmail) + "</p>",
      '<p style="margin:0 0 16px;"><strong>User id:</strong> ' + escapeHtml(submitterId) + "</p>",
      '<table style="width:100%;border-collapse:collapse;margin-bottom:16px;">' + rowsHtml + "</table>",
      '<h3 style="margin:0 0 8px;color:#cbd5e1;">One-off prompt</h3>',
      '<pre style="white-space:pre-wrap;background:#111a2c;border:1px solid #1e293b;border-radius:8px;padding:12px;margin:0 0 16px;">' + escapeHtml(oneoffPrompt) + "</pre>",
      '<h3 style="margin:0 0 8px;color:#cbd5e1;">Template prompt</h3>',
      '<pre style="white-space:pre-wrap;background:#111a2c;border:1px solid #1e293b;border-radius:8px;padding:12px;margin:0;">' + escapeHtml(templatePrompt) + "</pre>",
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
        reply_to: String(submitterEmail).includes("@") ? submitterEmail : undefined
      })
    });

    if (!resp.ok) {
      let details = "Failed to send submission email.";
      try {
        const payload = await resp.json();
        details = payload?.message || payload?.error || details;
      } catch (_err) {
        const raw = await resp.text().catch(() => "");
        if (raw) details = raw.slice(0, 200);
      }
      console.error("send-custom-idea-email failed", resp.status, details);
      return json(res, 500, { error: details });
    }

    return json(res, 200, { sent: true });
  } catch (error) {
    console.error("send-custom-idea-email exception", error);
    return json(res, 500, { error: error?.message || "Failed to send submission email." });
  }
};
