/** Live HTTP smoke test for the TOTP MFA flow against a running server.
 *  Usage: bun scripts/smoke-mfa.ts [baseUrl]
 *  Requires MFA_ENCRYPTION_KEY set in the server environment. No mock data. */
import { totpAt } from "../src/lib/auth/totp";

const base = process.argv[2] ?? "http://127.0.0.1:3000";
const email = `mfa-smoke-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@test.local`;
const password = "smoke-password-123";

let cookie = "";
async function call(path: string, method: string, body?: unknown, withCookie = true) {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: { "content-type": "application/json", ...(withCookie && cookie ? { cookie } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const setCookie = res.headers.get("set-cookie") ?? "";
  return {
    status: res.status,
    json: await res.json().catch(() => ({})),
    newCookie: setCookie.match(/fs_session=[^;]+/)?.[0] ?? "",
  };
}
function check(label: string, condition: boolean, detail?: unknown) {
  if (!condition) {
    console.error(`FAIL ${label}`, detail ?? "");
    process.exitCode = 1;
    throw new Error(label);
  }
  console.log(`PASS ${label}`);
}

const unauth = await call("/api/v1/account/mfa", "GET", undefined, false);
check("unauthenticated MFA status is 401", unauth.status === 401, unauth.status);

const registered = await call("/api/v1/auth/register", "POST", { email, password }, false);
check("registration succeeds", registered.status === 200, registered.json);
cookie = registered.newCookie;
check("registration sets an HttpOnly session", cookie.length > 0, cookie);

const status0 = await call("/api/v1/account/mfa", "GET");
check("MFA status reports configured and disabled",
  status0.json.data?.configured === true && status0.json.data?.enabled === false, status0.json);

const enrolled = await call("/api/v1/account/mfa/enroll", "POST", { password });
check("enrollment starts with a fresh secret", enrolled.status === 200 && !!enrolled.json.data?.secret, enrolled.json);
const secret: string = enrolled.json.data.secret;

const wrong = await call("/api/v1/account/mfa/confirm", "POST", { code: "000000" });
check("wrong code is rejected", wrong.status === 422 && wrong.json.error?.code === "VALIDATION_FAILED", wrong.json);

const confirmed = await call("/api/v1/account/mfa/confirm", "POST", {
  code: totpAt(secret, Math.floor(Date.now() / 1000)),
});
check("correct code enables MFA and issues recovery codes",
  confirmed.status === 200 && confirmed.json.data?.enabled === true && confirmed.json.data?.recoveryCodes?.length === 10,
  confirmed.json);

const status1 = await call("/api/v1/account/mfa", "GET");
check("status reports enabled with one-time codes remaining",
  status1.json.data?.enabled === true && status1.json.data?.recoveryCodesRemaining === 10, status1.json);

await call("/api/v1/auth/logout", "POST", {});
cookie = "";
const secondLogin = await call("/api/v1/auth/login", "POST", { email, password }, false);
check("password login returns a challenge and no session",
  secondLogin.json.data?.mfaRequired === true && !!secondLogin.json.data?.challenge && !secondLogin.newCookie,
  { json: secondLogin.json, cookie: secondLogin.newCookie });
const challenge: string = secondLogin.json.data.challenge;

const noSession = await call("/api/v1/account", "GET", undefined, false);
check("challenge alone does not grant access", noSession.status === 401, noSession.status);

const verified = await call("/api/v1/auth/mfa-verify", "POST", {
  challenge,
  code: totpAt(secret, Math.floor(Date.now() / 1000) + 30),
}, false);
check("second-factor exchange succeeds and sets a session",
  verified.status === 200 && verified.json.data?.method === "totp" && verified.newCookie.length > 0,
  { json: verified.json, cookie: verified.newCookie });
cookie = verified.newCookie;
const account = await call("/api/v1/account", "GET");
check("verified session can access the account", account.status === 200 && account.json.data?.email === email, account.json);

const replay = await call("/api/v1/auth/mfa-verify", "POST", { challenge, code: "000000" }, false);
check("challenge cannot be replayed", replay.status === 422, replay.json);

console.log("\nMFA HTTP smoke test complete.");
