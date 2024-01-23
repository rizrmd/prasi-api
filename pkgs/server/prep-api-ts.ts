import { spawnSync } from "bun";
import { existsAsync, readAsync } from "fs-jetpack";
import { dir } from "../utils/dir";
import { g } from "../utils/global";

export const prepareAPITypes = async () => {
  const out: string[] = [];
  for (const [k, v] of Object.entries(g.api)) {
    const name = k.substring(0, k.length - 3).replace(/\W/gi, "_");

    let p = {
      path: `"app/srv/api/${v.path}"`,
      handler: `"./api/${v.path.substring(0, v.path.length - 3)}"`,
    };

    if (!(await existsAsync(dir(p.path)))) {
      p.path = `"pkgs/api/${v.path}"`;
      p.handler = `"../../pkgs/api/${v.path.substring(0, v.path.length - 3)}"`;
    }

    out.push(`\
export const ${name} = {
  name: "${name}",
  url: "${v.url}",
  path: "app/srv/api/${v.path}",
  args: ${JSON.stringify(v.args)},
  handler: import(${p.handler})
}`);
  }
  await Bun.write(dir(`app/srv/exports.ts`), out.join(`\n`));

  const targetFile = dir("app/srv/exports.d.ts");
  spawnSync(
    [
      dir("node_modules/.bin/tsc"),
      dir("app/srv/exports.ts"),
      "--declaration",
      "--emitDeclarationOnly",
      "--outFile",
      targetFile,
    ],
    {
      cwd: dir(`node_modules/.bin`),
    }
  );

  let res = await readAsync(targetFile);
  if (res) {
    res = res.replace('export * from "@prisma/client";', "");
    res = res.replace("server: Server;", "");
    res = res.replace(`import { PrismaClient } from "app/db/db";`, "");
    res = res.replace(`db: PrismaClient;`, "");
    await Bun.write(targetFile, res);
  }
};
