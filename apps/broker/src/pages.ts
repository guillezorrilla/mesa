// The privacy policy and terms the vendors' app listings link to (ADR-0014).

const page = (title: string, body: string) =>
  `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Mesa: ${title}</title>
<style>body{font:16px/1.5 system-ui,sans-serif;max-width:40rem;margin:2rem auto;padding:0 1rem;color:#222}</style>
</head>
<body>
<h1>Mesa: ${title}</h1>
${body}
</body>
</html>
`;

export const PRIVACY = page(
  'Privacy policy',
  `<p>Mesa is a local macOS app. This service, the Mesa broker, only relays the OAuth sign-in between Mesa and a source you connect (Atlassian, Notion, or ClickUp).</p>
<ul>
<li>The broker sees the authorization code and the tokens it exchanges or refreshes with the source, and passes them straight back to Mesa on your Mac. It stores nothing.</li>
<li>The broker never receives your source content or Mesa's API calls to the source. Mesa calls the source directly.</li>
<li>The broker does not log request or response bodies.</li>
<li>Mesa stores no personal data from your source account: only the tokens, their expiry, and the sites they reach (each site's id, name, and address), in your macOS Keychain.</li>
<li>Mesa reads the connected source and never writes to it. Content you import stays in your own vault on your Mac.</li>
<li>There are no analytics and no accounts. No data is sold or shared.</li>
<li>Disconnecting in Mesa removes the token from your Keychain. You can also revoke Mesa in the source's account settings at any time.</li>
</ul>
<p>Contact: the owner of the Mesa repository on GitHub, <a href="https://github.com/guillezorrilla">guillezorrilla</a>.</p>`,
);

export const TERMS = page(
  'Terms of use',
  `<ul>
<li>Mesa and this broker are provided as is, with no warranty of any kind.</li>
<li>You are responsible for using a connected source within its terms and your organization's policies.</li>
<li>This service can change or stop at any time. If it does, connections need reconnecting.</li>
</ul>
<p>Contact: the owner of the Mesa repository on GitHub, <a href="https://github.com/guillezorrilla">guillezorrilla</a>.</p>`,
);
