export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const payload = req.body && typeof req.body === "object" ? req.body : {};
  const model = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-20250514";

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      ...payload,
      model
    }),
  });

  if (payload.stream && response.body) {
    res.status(response.status);
    res.setHeader(
      "Content-Type",
      response.headers.get("content-type") || "text/event-stream; charset=utf-8"
    );
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");

    const reader = response.body.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(Buffer.from(value));
    }
    res.end();
    return;
  }

  const text = await response.text();
  try {
    const data = JSON.parse(text);
    return res.status(response.status).json(data);
  } catch (_error) {
    return res.status(response.status).send(text);
  }
}
