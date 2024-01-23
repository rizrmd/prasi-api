import { inspectAsync, listAsync } from "fs-jetpack";
import { join } from "path";
import { createRouter } from "radix3";
import { g } from "../utils/global";
import { parseArgs } from "./parse-args";
import { serveAPI } from "./serve-api";
import { serveWeb } from "./serve-web";
import { dir } from "../utils/dir";
import { file } from "bun";
import { trim } from "radash";

export const createServer = async () => {
  g.router = createRouter({ strictTrailingSlash: true });
  g.api = {};
  const scan = async (path: string, root?: string) => {
    const apis = await listAsync(path);
    if (apis) {
      for (const filename of apis) {
        const importPath = join(path, filename);
        if (filename.endsWith(".ts")) {
          try {
            const api = await import(importPath);
            let args: string[] = await parseArgs(importPath);
            const route = {
              url: api._.url,
              args,
              fn: api._.api,
              path: importPath.substring((root || path).length + 1),
            };
            g.api[filename] = route;
            g.router.insert(route.url, g.api[filename]);
          } catch (e) {
            g.log.warn(
              `Failed to import app/srv/api${importPath.substring(
                (root || path).length
              )}`
            );

            const f = file(importPath);
            if (f.size > 0) {
              console.error(e);
            } else {
              g.log.warn(` ➨ file is empty`);
            }
          }
        } else {
          const dir = await inspectAsync(importPath);
          if (dir?.type === "dir") {
            await scan(importPath, path);
          }
        }
      }
    }
  };
  await scan(dir(`app/srv/api`));
  await scan(dir(`pkgs/api`));

  g.server = Bun.serve({
    port: g.port,
    async fetch(req) {
      const url = new URL(req.url);

      const web = await serveWeb(url, req);
      let index = ["", ""];
      if (web) {
        if (Array.isArray(web)) index = web;
        else {
          return web;
        }
      }

      const api = await serveAPI(url, req);
      if (api) {
        return api;
      }

      if (index) {
        let status: any = {};

        if (!["", "index.html"].includes(trim(url.pathname, " /"))) {
          status = {
            status: 404,
            statusText: "Not Found",
          };
        }

        const [site_id, body] = index;
        if (g.web[site_id]) {
          const router = g.web[site_id].router;
          if (router) {
            let found = router.lookup(url.pathname);
            if (!found) {
              found = router.lookup(url.pathname + "/");
            }
            if (found) {
              status = {};
            }
          }
        }

        return new Response(body, {
          ...status,
          headers: {
            "content-type": "text/html",
          },
        });
      }

      return new Response(`404 Not Found`, {
        status: 404,
        statusText: "Not Found",
      });
    },
  });

  if (process.env.PRASI_MODE === "dev") {
    g.log.info(`http://localhost:${g.server.port}`);
  } else {
    g.log.info(`Started at port: ${g.server.port}`);
  }
};
