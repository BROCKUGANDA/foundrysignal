/** Route-level OAuth smoke test (no real provider credentials required).
 *  Verifies capability advertisement, authorization redirect construction and
 *  callback error handling. The live token exchange needs registered provider
 *  credentials and is covered by tests/oauth.test.ts with injected responses. */
export {};

const base = process.argv[2] ?? "http://127.0.0.1:3000";
function check(label: string, ok: boolean, detail?: unknown) {
  if (!ok) { console.error(`FAIL ${label}`, detail ?? ""); process.exitCode = 1; throw new Error(label); }
  console.log(`PASS ${label}`);
}

const caps = await (await fetch(`${base}/api/v1/capabilities`)).json();
check("public capability advertises configured providers",
  caps.data?.oauth?.available === true && caps.data.oauth.providers?.includes("GITHUB"), caps.data?.oauth);

const start = await fetch(`${base}/api/v1/auth/oauth/github/start`, { redirect: "manual" });
const redirectLocation = start.headers.get("location") ?? "";
check("start redirects to GitHub with state and PKCE",
  start.status === 303 && redirectLocation.startsWith("https://github.com/login/oauth/authorize?") &&
  redirectLocation.includes("state=") && redirectLocation.includes("code_challenge=") && redirectLocation.includes("S256"),
  { status: start.status, location: redirectLocation });
const state = new URL(redirectLocation).searchParams.get("state") ?? "";
check("state is a 256-bit random value", state.length === 43, state.length);

const badCallback = await fetch(`${base}/api/v1/auth/oauth/github/callback?code=fake&state=invalid`, { redirect: "manual" });
check("invalid state redirects to a generic error without leaking details",
  badCallback.status === 303 && (badCallback.headers.get("location") ?? "").includes("oauth=error"),
  { status: badCallback.status, location: badCallback.headers.get("location") });

const denied = await fetch(`${base}/api/v1/auth/oauth/github/callback?error=access_denied`, { redirect: "manual" });
check("provider denial redirects honestly",
  denied.status === 303 && (denied.headers.get("location") ?? "").includes("oauth=denied"),
  { status: denied.status, location: denied.headers.get("location") });

const noChallenge = await fetch(`${base}/api/v1/auth/mfa-challenge`, {
  method: "POST", headers: { "content-type": "application/json" }, body: "{}",
});
check("MFA challenge pickup is empty without an OAuth callback cookie", noChallenge.status !== 200, noChallenge.status);

console.log("\nOAuth route smoke test complete.");
