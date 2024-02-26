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

  await getContent("load.js.dev");
  console.log("API Loaded");
};

export const getApiEntry = () => {
  const res: any = {};
  for (const [k, v] of Object.entries(g.api)) {
    const name = k.substring(0, k.length - 3);
    res[name] = { ...v, name, path: `app/srv/api/${v.path}` };
  }

  return res;
};

export const getContent = async (
  type: keyof typeof g.api_gen,
  url?: string
) => {
  if (!g.api_gen) {
    g.api_gen = {
      "load.js.dev": "",
      "load.js.prod": "",
      "load.json": "",
    };
  }

  if (type === "load.json") {
    if (!g.api_gen[type])
      g.api_gen[type] = JSON.stringify({
        apiEntry: getApiEntry(),
        apiTypes: (await getApiTypes()) || "",
        prismaTypes: {
          "prisma.d.ts": await getPrisma("prisma"),
          "runtime/index.d.ts": await getPrisma("runtime"),
          "runtime/library.d.ts": await getPrisma("library"),
        },
      });
  } else if (type === "load.js.dev") {
    if (!g.api_gen[type])
      g.api_gen[type] = `\
(() => {
  const baseurl = new URL(location.href);
  baseurl.pathname = '';
  const url = ${url} || baseurl.toString();
  const w = window;
  if (!w.prasiApi) {
    w.prasiApi = {};
  }
  w.prasiApi[url] = {
    apiEntry: ${JSON.stringify(getApiEntry())},
    apiTypes: ${JSON.stringify((await getApiTypes()) || "")},
    prismaTypes: {
      "prisma.d.ts": ${await getPrisma("prisma")},
      "runtime/index.d.ts": ${await getPrisma("runtime")},
      "runtime/library.d.ts": ${await getPrisma("library")},
    },
  };
})();`;
  } else if (type === "load.js.prod") {
    if (!g.api_gen[type])
      g.api_gen[type] = `\
(() => {
  const baseurl = new URL(location.href);
  baseurl.pathname = '';
  const url = ${url} || baseurl.toString();
  const w = window;
  if (!w.prasiApi) {
    w.prasiApi = {};
  }
  w.prasiApi[url] = {
    apiEntry: ${JSON.stringify(getApiEntry())},
  }
})();`;
  }
  return g.api_gen[type];
};

const getApiTypes = async () => {
  return (
    `\
declare module "gen/srv/api/entry" {
    export * as srv from "gen/srv/api/srv";
}
  
` +
    ((await readAsync(dir("app/srv/exports.d.ts"))) || "")
      .replace(/\"app\/srv\/api/gi, '"srv/api')
      .replace(
        'declare module "app/srv/exports"',
        'declare module "gen/srv/api/srv"'
      )
  );
};

const getPrisma = async (path: string) => {
  if (path === "prisma")
    return JSON.stringify(
      (
        (await readAsync(dir("node_modules/.prisma/client/index.d.ts"))) || ""
      ).replace(`@prisma/client/runtime/library`, `./runtime/library`)
    );

  if (path === "runtime")
    return JSON.stringify(
      await readAsync(
        dir("node_modules/@prisma/client/runtime/index-browser.d.ts")
      )
    );

  if (path === "library")
    return JSON.stringify(
      await readAsync(dir("node_modules/@prisma/client/runtime/library.d.ts"))
    );

  return JSON.stringify({});
};
