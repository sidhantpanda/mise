// The one screen a user actually sees in the OAuth flow: Claude (or ChatGPT) sends
// them here, they sign in if needed, pick which household the connection may act on,
// and approve. Rendered server-side as a self-contained document rather than through
// the React app, because it has to work as a plain top-level navigation with no
// client-side router, no API round-trip, and no session assumptions.

export type ConsentParams = {
  clientId: string;
  redirectUri: string;
  state?: string;
  scope: string;
  codeChallenge: string;
  codeChallengeMethod: string;
  resource?: string;
};

export type ConsentHousehold = { id: string; name: string; type: string };

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// The OAuth request is round-tripped through the form so the POST carries the same
// parameters the client sent on the GET — the server re-validates them either way.
function hiddenFields(params: ConsentParams): string {
  const fields: Record<string, string | undefined> = {
    client_id: params.clientId,
    redirect_uri: params.redirectUri,
    state: params.state,
    scope: params.scope,
    code_challenge: params.codeChallenge,
    code_challenge_method: params.codeChallengeMethod,
    resource: params.resource,
  };
  return Object.entries(fields)
    .filter(([, value]) => value !== undefined && value !== "")
    .map(([name, value]) => `<input type="hidden" name="${name}" value="${escapeHtml(value!)}">`)
    .join("\n      ");
}

const STYLES = `
  :root {
    color-scheme: light dark;
    --bg: oklch(0.98 0.006 80);
    --card: oklch(1 0 0);
    --border: oklch(0.9 0.008 80);
    --fg: oklch(0.25 0.02 60);
    --muted: oklch(0.55 0.02 60);
    --primary: oklch(0.62 0.16 42);
    --primary-fg: oklch(1 0 0);
    --danger: oklch(0.55 0.2 25);
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --bg: oklch(0.19 0.01 60);
      --card: oklch(0.24 0.012 60);
      --border: oklch(0.32 0.012 60);
      --fg: oklch(0.95 0.008 80);
      --muted: oklch(0.68 0.015 70);
    }
  }
  * { box-sizing: border-box; }
  body {
    margin: 0; min-height: 100vh; display: flex; align-items: center; justify-content: center;
    padding: 2.5rem 1rem; background: var(--bg); color: var(--fg);
    font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
  }
  .wrap { width: 100%; max-width: 26rem; }
  .head { text-align: center; margin-bottom: 1.75rem; }
  .logo {
    width: 3.5rem; height: 3.5rem; border-radius: 1rem; object-fit: contain; margin: 0 auto 1rem;
    display: block;
  }
  h1 { font-size: 1.5rem; line-height: 1.25; margin: 0 0 0.4rem; font-weight: 600; }
  .sub { color: var(--muted); font-size: 0.875rem; margin: 0; }
  .card { background: var(--card); border: 1px solid var(--border); border-radius: 1rem; padding: 1.5rem; }
  label { display: block; font-size: 0.6875rem; text-transform: uppercase; letter-spacing: 0.06em;
    color: var(--muted); margin-bottom: 0.4rem; }
  input[type=email], input[type=password], select {
    width: 100%; padding: 0.6rem 0.75rem; border-radius: 0.6rem; border: 1px solid var(--border);
    background: var(--bg); color: var(--fg); font-size: 0.95rem; margin-bottom: 1rem;
  }
  input:focus, select:focus { outline: 2px solid var(--primary); outline-offset: 1px; }
  button {
    width: 100%; padding: 0.7rem 1rem; border-radius: 9999px; border: 1px solid transparent;
    font-size: 0.95rem; font-weight: 500; cursor: pointer;
  }
  .primary { background: var(--primary); color: var(--primary-fg); }
  .primary:hover { opacity: 0.9; }
  .ghost { background: transparent; color: var(--muted); border-color: var(--border); margin-top: 0.6rem; }
  .ghost:hover { color: var(--fg); }
  .perms { list-style: none; padding: 0; margin: 0 0 1.25rem; }
  .perms li { display: flex; gap: 0.6rem; align-items: flex-start; padding: 0.45rem 0;
    font-size: 0.875rem; color: var(--fg); }
  .perms svg { flex: none; margin-top: 0.15rem; color: var(--primary); }
  .error { color: var(--danger); font-size: 0.875rem; margin: 0 0 1rem; }
  .foot { text-align: center; color: var(--muted); font-size: 0.75rem; margin-top: 1.25rem; line-height: 1.5; }
  .client { font-weight: 600; }
`;

function shell(title: string, subtitle: string, body: string): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex">
  <title>${escapeHtml(title)} - Mise</title>
  <style>${STYLES}</style>
</head>
<body>
  <div class="wrap">
    <div class="head">
      <img class="logo" src="/icon-192.png" alt="Mise">
      <h1>${escapeHtml(title)}</h1>
      <p class="sub">${subtitle}</p>
    </div>
    <div class="card">
${body}
    </div>
  </div>
</body>
</html>`;
}

const CHECK_ICON =
  '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>';

// Step 1 — the user arrived from Claude without a Mise session. Same form as the
// app's login, but posting back into the OAuth flow so the request survives sign-in.
export function renderLoginPage(
  params: ConsentParams,
  opts: { clientName: string; error?: string },
): string {
  return shell(
    "Sign in to Mise",
    `to connect <span class="client">${escapeHtml(opts.clientName)}</span>`,
    `      <form method="post" action="/oauth/authorize">
      ${hiddenFields(params)}
      <input type="hidden" name="action" value="login">
      ${opts.error ? `<p class="error">${escapeHtml(opts.error)}</p>` : ""}
      <label for="email">Email</label>
      <input id="email" type="email" name="email" autocomplete="email" required autofocus placeholder="you@email.com">
      <label for="password">Password</label>
      <input id="password" type="password" name="password" autocomplete="current-password" required placeholder="••••••••">
      <button class="primary" type="submit">Sign in</button>
    </form>`,
  );
}

// Step 2 — the consent screen. The household picker is the answer to "which kitchen
// should the assistant act on": it defaults to the user's active household and is
// only shown as a choice when they belong to more than one.
export function renderConsentPage(
  params: ConsentParams,
  opts: {
    clientName: string;
    clientUri?: string | null;
    userEmail: string;
    households: ConsentHousehold[];
    defaultHouseholdId: string;
    scopes: string[];
  },
): string {
  const canWrite = opts.scopes.includes("write");
  const permissions = [
    "Read your recipes, meal plan, shopping list, and pantry",
    ...(canWrite
      ? ["Add and update recipes, meals, shopping items, and pantry items on your behalf"]
      : []),
  ];

  const householdField =
    opts.households.length > 1
      ? `      <label for="household_id">Household to connect</label>
      <select id="household_id" name="household_id">
        ${opts.households
          .map(
            (h) =>
              `<option value="${escapeHtml(h.id)}"${h.id === opts.defaultHouseholdId ? " selected" : ""}>${escapeHtml(h.name)}</option>`,
          )
          .join("\n        ")}
      </select>`
      : `      <input type="hidden" name="household_id" value="${escapeHtml(opts.defaultHouseholdId)}">`;

  const householdNote =
    opts.households.length > 1
      ? "You can switch the connected household later by asking the assistant."
      : `Connected to <strong>${escapeHtml(opts.households[0]?.name ?? "your household")}</strong>.`;

  return shell(
    `Connect ${opts.clientName}`,
    `<span class="client">${escapeHtml(opts.clientName)}</span> wants to access your Mise kitchen`,
    `      <ul class="perms">
        ${permissions.map((p) => `<li>${CHECK_ICON}<span>${escapeHtml(p)}</span></li>`).join("\n        ")}
      </ul>
      <form method="post" action="/oauth/authorize">
      ${hiddenFields(params)}
${householdField}
      <input type="hidden" name="action" value="approve">
      <button class="primary" type="submit">Allow access</button>
      </form>
      <form method="post" action="/oauth/authorize">
      ${hiddenFields(params)}
      <input type="hidden" name="action" value="deny">
      <button class="ghost" type="submit">Cancel</button>
      </form>
      <p class="foot">Signed in as ${escapeHtml(opts.userEmail)}. ${householdNote}<br>
      You can revoke this connection any time in Mise settings.</p>`,
  );
}

// Terminal errors (bad client_id, unregistered redirect_uri) can't be redirected
// back to the client — that would be an open redirect — so they render here instead.
export function renderErrorPage(message: string): string {
  return shell(
    "Connection failed",
    "This request could not be completed",
    `      <p class="error">${escapeHtml(message)}</p>
      <p class="foot">Close this window and try connecting again from your assistant.</p>`,
  );
}
