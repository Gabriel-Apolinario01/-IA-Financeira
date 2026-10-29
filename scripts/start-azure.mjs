import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
process.chdir(projectRoot);
const authMode = process.env.AZURE_AUTH_MODE?.trim() || "preview";

if (authMode === "app-service") {
  if (
    !process.env.AZURE_TENANT_ID?.trim() ||
    process.env.WEBSITE_AUTH_ENABLED?.toLowerCase() !== "true" ||
    !process.env.WEBSITE_SITE_NAME?.trim()
  ) {
    throw new Error("Habilite App Service Authentication para Microsoft Entra e configure AZURE_TENANT_ID antes de iniciar.");
  }

  const preparation = spawnSync(process.execPath, ["scripts/prepare-azure-db.mjs"], {
    stdio: "inherit",
    env: process.env,
  });
  if (preparation.error) throw preparation.error;
  if (preparation.status !== 0) process.exit(preparation.status ?? 1);
} else if (authMode === "preview") {
  console.info("Prévia pública iniciada sem Microsoft Entra ou PostgreSQL; dados financeiros ficam apenas no navegador.");
} else {
  throw new Error("AZURE_AUTH_MODE deve ser 'preview' ou 'app-service'.");
}

const nextCli = path.join(projectRoot, "node_modules", "next", "dist", "bin", "next");
const port = Number(process.env.PORT || 8080);
if (!Number.isInteger(port) || port < 1 || port > 65_535) throw new Error("A porta PORT do App Service é inválida.");
const server = spawnSync(process.execPath, [nextCli, "start", "--hostname", "0.0.0.0", "--port", String(port)], {
  stdio: "inherit",
  env: process.env,
});
if (server.error) throw server.error;
process.exit(server.status ?? 1);
