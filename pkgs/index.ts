import { $ } from "execa";
import { dirAsync, existsAsync } from "fs-jetpack";
import { deploy } from "utils/deploy";
import { startDevWatcher } from "utils/dev-watcher";
import { dir } from "utils/dir";
import { genEnv, parseEnv } from "utils/parse-env";
import { preparePrisma } from "utils/prisma";
import { generateAPIFrm } from "./server/api-frm";
import { createServer } from "./server/create";
import { prepareAPITypes } from "./server/prep-api-ts";
import { config } from "./utils/config";
import { g } from "./utils/global";
import { createLogger } from "./utils/logger";

if (process.argv[process.argv.length - 1] === "skip_types") {
  g.skip_build_types = true;
}

let db_env: any = {};
try {
  db_env = parseEnv(await Bun.file(dir("app/db/.env")).text());
  process.env.DATABASE_URL = db_env.DATABASE_URL;
} catch (e) {}

g.compress = { mode: "all" };
g.mode = process.argv.includes("dev") ? "dev" : "prod";
g.datadir = g.mode === "prod" ? "../data" : ".data";

if (!(await existsAsync(dir("app")))) {
  await dirAsync(dir("app"));
}

if (!(await existsAsync(dir("app/db")))) {
  await $`unzip -o pkgs/zip/dbzip -d app`;
}

if (!(await existsAsync(dir("app/srv")))) {
  await $`unzip -o pkgs/zip/srvzip -d app`;
}

if (!process.env.PORT) {
  g.port = 3000;

  const env = genEnv({
    PORT: g.port,
  });
  await Bun.write(".env", env);
} else {
  g.port = parseInt(process.env.PORT);
}

await preparePrisma();
await createLogger();

if (g.db) {
  try {
    await g.db.$connect();
  } catch (e) {
    console.error(e);
  }
}

await config.init();

g.log.info(g.mode === "dev" ? "DEVELOPMENT" : "PRODUCTION");

await deploy.init();
if (g.mode === "dev") {
  await startDevWatcher();
}

await createServer();

await generateAPIFrm();
await prepareAPITypes();
