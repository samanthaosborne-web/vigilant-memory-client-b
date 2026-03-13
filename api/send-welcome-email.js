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

module.exports = async (req, res) => {
  if (req.method !== "POST") return json(res, 405, { error: "Method not allowed" });

  const RESEND_API_KEY = process.env.RESEND_API_KEY;
  const FROM_EMAIL = process.env.FROM_EMAIL || "AdvisaStacks <noreply@advisastacks.com>";
  const APP_URL = process.env.APP_URL || "https://advisastacks.com";

  if (!RESEND_API_KEY) {
    return json(res, 500, { error: "Email service not configured." });
  }

  const body = parseBody(req);
  const email = (body.email || "").trim();
  const firstName = (body.firstName || "").trim() || "there";

  if (!email) return json(res, 400, { error: "Email is required." });

  const logoUrl = APP_URL.replace(/\/$/, "") + "/advisastacks-logo.png.png";
  const billingUrl = APP_URL.replace(/\/$/, "") + "/billing.html";

  const html = [
    '<div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#f9faff;">',

    '<img src="' + logoUrl + '" alt="AdvisaStacks" style="width:160px;height:auto;margin-bottom:20px;" />',

    '<h2 style="color:#e75a00;margin:0 0 16px;font-size:22px;line-height:1.3;">',
    'Welcome to AdvisaStacks &mdash; use TOOLSDOWN for 1 week free',
    '</h2>',

    '<p style="margin:0 0 14px;line-height:1.6;">Hi ' + firstName + ',</p>',

    '<p style="margin:0 0 14px;line-height:1.6;">Welcome to AdvisaStacks.</p>',

    '<p style="margin:0 0 14px;line-height:1.6;">',
    'Your account is now set up, and the next step is billing so you can start using the app properly.',
    '</p>',

    '<p style="margin:0 0 14px;line-height:1.6;">',
    'To make it easy to get started, you can use the code <strong style="color:#e75a00;">TOOLSDOWN</strong> at checkout to get <strong>1 week free</strong>.',
    '</p>',

    '<p style="margin:0 0 14px;line-height:1.6;">',
    'AdvisaStacks is built to help tradies get through the business side faster with practical tools that save time and reduce the usual back-and-forth.',
    '</p>',

    '<p style="margin:0 0 8px;line-height:1.6;">Inside the app, you can use it to:</p>',

    '<ul style="margin:0 0 18px;padding-left:20px;line-height:1.8;">',
    '<li>get a head start on admin and business tasks</li>',
    '<li>turn rough ideas into clear, usable outputs</li>',
    '<li>save time on planning, messaging, and day-to-day business jobs</li>',
    '<li>avoid starting from scratch every time</li>',
    '<li>get practical help you can use between jobs or on the go</li>',
    '</ul>',

    '<p style="margin:0 0 18px;line-height:1.6;">',
    'The goal is simple: less time stuck on the business side, and more time getting things done.',
    '</p>',

    '<p style="margin:0 0 18px;line-height:1.6;">',
    'Use <strong style="color:#e75a00;">TOOLSDOWN</strong> when you go through billing to claim your free week and see if it fits the way you work.',
    '</p>',

    '<a href="' + billingUrl + '" style="display:inline-block;background:#e75a00;color:#313131;',
    'text-decoration:none;padding:14px 28px;border-radius:10px;font-weight:700;font-size:16px;',
    'box-shadow:0 4px 12px rgba(0,0,0,0.2);">Get Access!</a>',

    '<p style="margin:24px 0 4px;line-height:1.6;">Cheers!<br/>Sam<br/>AdvisaStacks</p>',

    '<img src="' + logoUrl + '" alt="AdvisaStacks" style="width:120px;height:auto;margin-top:16px;" />',

    '</div>'
  ].join("\n");

  try {
    const resp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + RESEND_API_KEY,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: [email],
        subject: "Welcome to AdvisaStacks \u2014 use TOOLSDOWN for 1 week free",
        html: html
      })
    });

    if (!resp.ok) {
      return json(res, 500, { error: "Failed to send welcome email." });
    }

    return json(res, 200, { sent: true });
  } catch (err) {
    return json(res, 500, { error: "Failed to send welcome email." });
  }
};
