const token = process.env.CLOUDFLARE_API_TOKEN;
if (!process.argv.includes("--confirm-one-file") || !token || !/^[A-Za-z0-9_-]+$/.test(token)) {
  throw new Error("Configure a private CLOUDFLARE_API_TOKEN with zone-read/cache-purge permission and pass --confirm-one-file. No purge performed.");
}
const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
async function api(path, body) {
  const response = await fetch(`https://api.cloudflare.com/client/v4${path}`, {
    headers, ...(body ? { method: "POST", body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(20000),
  });
  const data = await response.json();
  if (!response.ok || !data.success) throw new Error(`Cloudflare request failed: HTTP ${response.status}; codes ${(data.errors || []).map((error) => error.code).join(",")}. No credentials logged.`);
  return data.result;
}
const zones = await api("/zones?name=aiazimara.com");
if (!Array.isArray(zones) || zones.length !== 1 || zones[0].name !== "aiazimara.com") throw new Error("Expected one exact aiazimara.com zone.");
const url = "https://foundrysignal.aiazimara.com/_next/static/chunks/32sr-oc8n7hcr.js";
await api(`/zones/${zones[0].id}/purge_cache`, { files: [url] });
console.log(`Purged one exact URL: ${url}`);