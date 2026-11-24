import { mkdir, chmod } from "node:fs/promises";
import { spawn } from "node:child_process";

if (process.platform !== "linux") throw new Error("Run this backup on the Linux deployment host.");
const directory = "/mnt/data/backups/foundrysignal";
const connection = new URL(process.env.DATABASE_URL || "missing:");
if (!["postgres:", "postgresql:"].includes(connection.protocol)) throw new Error("A PostgreSQL DATABASE_URL is required.");
process.umask(0o077);
await mkdir(directory, { recursive: true, mode: 0o700 });
await chmod(directory, 0o700);
const file = `foundrysignal-${new Date().toISOString().replace(/[:.]/g, "-")}.dump`;
const env = {
  ...process.env,
  PGHOST: connection.hostname, PGPORT: connection.port || "5432",
  PGUSER: decodeURIComponent(connection.username), PGPASSWORD: decodeURIComponent(connection.password),
  PGDATABASE: decodeURIComponent(connection.pathname.slice(1)), PGSSLMODE: connection.searchParams.get("sslmode") || "prefer",
};
const child = spawn("docker", [
  "run", "--rm", "--network", "host", "--user", `${process.getuid()}:${process.getgid()}`,
  ...["PGHOST", "PGPORT", "PGUSER", "PGPASSWORD", "PGDATABASE", "PGSSLMODE"].flatMap((key) => ["--env", key]),
  "--volume", `${directory}:/backups`, "postgres:18-alpine", "pg_dump", "--format=custom", "--no-owner", "--file", `/backups/${file}`,
], { env, stdio: ["ignore", "ignore", "pipe"] });
// Error text from a database client is deliberately not relayed to public logs.
child.stderr.resume();
await new Promise((resolve, reject) => {
  child.once("error", () => reject(new Error("Unable to start PostgreSQL backup.")));
  child.once("exit", (code) => code === 0 ? resolve() : reject(new Error("PostgreSQL backup failed; release must not be activated.")));
});
await chmod(`${directory}/${file}`, 0o600);
console.log(`PostgreSQL custom-format backup created: ${directory}/${file}`);