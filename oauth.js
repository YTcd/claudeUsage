const https = require("https");

// Fetch the usage JSON from Claude Code's OAuth usage endpoint.
// Auth that works: Bearer token + the oauth beta header, and crucially NO
// anthropic-version header (its presence makes the server require x-api-key).
// Rejects with an error carrying { status, body } on non-200.
function fetchUsage(token) {
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: "api.anthropic.com",
        path: "/api/oauth/usage",
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
          "anthropic-beta": "oauth-2025-04-20",
        },
      },
      (res) => {
        let body = "";
        res.on("data", (c) => (body += c));
        res.on("end", () => {
          if (res.statusCode === 200) {
            try {
              resolve(JSON.parse(body));
            } catch {
              reject(new Error("usage response was not valid JSON"));
            }
          } else {
            reject(Object.assign(new Error(`HTTP ${res.statusCode}`), {
              status: res.statusCode,
              body,
            }));
          }
        });
      }
    );
    req.on("error", reject);
    req.setTimeout(15000, () => req.destroy(new Error("request timed out")));
    req.end();
  });
}

module.exports = { fetchUsage };
