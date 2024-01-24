import { startDevWatcher } from "utils/dev-watcher";
import { ensureNotRunning } from "utils/ensure";
import { preparePrisma } from "utils/prisma";
import { generateAPIFrm } from "./server/api-frm";
import { createServer } from "./server/create";
import { loadWeb } from "./server/load-web";
import { prepareAPITypes } from "./server/prep-api-ts";
import { config } from "./utils/config";
import { g } from "./utils/global";
import { createLogger } from "./utils/logger";

g.mode = process.argv.includes("dev") ? "dev" : "prod";
g.datadir = g.mode === "prod" ? "../data" : ".data";

if (!process.env.PORT) {
  g.port = 3000;
  await Bun.write(".env", `PORT=${g.port}`);
} else {
  g.port = parseInt(process.env.PORT);
}

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
