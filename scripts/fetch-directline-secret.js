#!/usr/bin/env node

const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

function run(cmd) {
  return execSync(cmd, {
    encoding: "utf8",
    stdio: ["pipe", "pipe", "inherit"],
  }).trim();
}

// These are already used by your infra / env files.
const resourceGroup = process.env.AZURE_RESOURCE_GROUP_NAME;
const subscriptionId = process.env.AZURE_SUBSCRIPTION_ID;
const suffix = process.env.RESOURCE_SUFFIX || "";
const botDomain = process.env.BOT_DOMAIN; // e.g. "botabcd1234.azurewebsites.net"

if (!resourceGroup || !subscriptionId) {
  console.error(
    "AZURE_RESOURCE_GROUP_NAME and AZURE_SUBSCRIPTION_ID must be set before running this script."
  );
  process.exit(1);
}

if (!botDomain && !suffix) {
  console.error(
    "Either BOT_DOMAIN or RESOURCE_SUFFIX must be set so we can deduce the bot name."
  );
  process.exit(1);
}

// Bot name used by Azure Bot Service.
// In your bicep, this is basically "bot${RESOURCE_SUFFIX}".
let botName = suffix ? `bot${suffix}` : undefined;
if (!botName && botDomain) {
  botName = botDomain.split(".")[0];
}

console.log(
  `Using bot name "${botName}" in resource group "${resourceGroup}" (subscription ${subscriptionId}).`
);

// 1. Make sure Direct Line channel exists (idempotent).
try {
  console.log("Checking Direct Line channel...");
  run(
    `az bot directline show --name ${botName} --resource-group ${resourceGroup} --with-secrets true --subscription ${subscriptionId} -o json`
  );
  console.log("Direct Line channel already exists.");
} catch (e) {
  console.log("Direct Line channel not found, creating it...");
  // Adjust trusted origins as needed (your web client origins).
  const trustedOrigins = botDomain
    ? `https://${botDomain}`
    : "https://localhost:3000";

  run(
    [
      "az bot directline create",
      `--name ${botName}`,
      `--resource-group ${resourceGroup}`,
      "--disablev1 true",
      `--trusted-origins ${trustedOrigins}`,
      `--subscription ${subscriptionId}`,
      "-o json",
    ].join(" ")
  );
  console.log("Direct Line channel created.");
}

// 2. Get the Direct Line secret with secrets included.
const json = run(
  [
    "az bot directline show",
    `--name ${botName}`,
    `--resource-group ${resourceGroup}`,
    "--with-secrets true",
    `--subscription ${subscriptionId}`,
    "-o json",
  ].join(" ")
);

let secret;
try {
  const data = JSON.parse(json);
  const sites = data?.properties?.properties?.sites;
  secret = Array.isArray(sites) && sites.length > 0 ? sites[0].key : undefined;
} catch (err) {
  console.error("Failed to parse Direct Line show output:", err);
}

if (!secret) {
  console.error("Could not find Direct Line secret in CLI response.");
  process.exit(1);
}

console.log("Fetched Direct Line secret.");

// 3. Write/update env/.env.local.user
const envFile = path.join(__dirname, "..", "env", ".env.local.user");
let existing = "";

try {
  existing = fs.readFileSync(envFile, "utf8");
} catch {
  // file may not exist yet, that's fine
}

const lines = existing
  .split(/\r?\n/)
  .filter(
    (line) =>
      line.trim().length > 0 && !line.startsWith("DIRECT_LINE_SECRET=")
  );

lines.push(`DIRECT_LINE_SECRET=${secret}`);

// Ensure newline at end
const output = lines.join("\n") + "\n";
fs.writeFileSync(envFile, output, "utf8");

console.log(`Updated ${envFile} with DIRECT_LINE_SECRET.`);