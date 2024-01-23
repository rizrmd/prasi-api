import { generateAPIFrm } from "./server/api-frm";
import { createServer } from "./server/create";
import { prepareAPITypes } from "./server/prep-api-ts";
import { config } from "./utils/config";
import { g } from "./utils/global";
import { createLogger } from "./utils/logger";
import { loadWeb } from "./server/load-web";
import { ensureNotRunning } from "utils/ensure";
import { preparePrisma } from "utils/prisma";
import { startDevWatcher } from "utils/dev-watcher";

g.mode = process.argv.includes("dev") ? "dev" : "prod";
g.datadir = g.mode === "prod" ? "../data" : ".data";

await preparePrisma();
await createLogger();
await ensureNotRunning();

if (g.db) {
  await g.db.$connect();
}

await config.init();

await loadWeb();

g.log.info(g.mode === "dev" ? "DEVELOPMENT" : "PRODUCTION");
if (g.mode === "dev") {
  await startDevWatcher();
}

await createServer();

await generateAPIFrm();
await prepareAPITypes();
