import { file } from "bun";
import { inspectAsync, listAsync } from "fs-jetpack";
import { join } from "path";
import { createRouter } from "radix3";
import { ensureNotRunning } from "utils/ensure";
import { prodIndex } from "utils/prod-index";
import { dir } from "../utils/dir";
import { g } from "../utils/global";
import { parseArgs } from "./parse-args";
import { serveAPI } from "./serve-api";
import { serveWeb } from "./serve-web";

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
              raw: !!api._.raw,
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

  g.createServer = (arg) => {
    return async (site_id: string) => {
      return arg;
    };
  };

  if (g.mode === "prod") {
    addEventListener("message", (e) => {
      if (e.data === "stop-server") {
        g.server.stop();
        postMessage("terminate");
      }
    });
  }

  await ensureNotRunning();

  g.server = Bun.serve({
    port: g.port,
    maxRequestBodySize: 1024 * 1024 * 128,
    async fetch(req) {
      const url = new URL(req.url) as URL;
      url.pathname = url.pathname.replace(/\/+/g, "/");

      const prasi = {};
      const index = prodIndex(g.deploy.config.site_id, prasi);

      const handle = async (req: Request) => {
        const api = await serveAPI(url, req);

        if (api) {
          return api;
        }

        if (g.deploy.router) {
          const found = g.deploy.router.lookup(url.pathname);
          if (found) {
            return await serveWeb({
              content: index.render(),
              pathname: "index.html",
              cache_accept: req.headers.get("accept-encoding") || "",
            });
          }

          if (g.deploy.content) {
            const core = g.deploy.content.code.core;
            const site = g.deploy.content.code.site;
            const pub = g.deploy.content.public;

            let pathname = url.pathname;
            if (url.pathname[0] === "/") pathname = pathname.substring(1);

            if (
              !pathname ||
              pathname === "index.html" ||
              pathname === "index.htm"
            ) {
              return await serveWeb({
                content: index.render(),
                pathname: "index.html",
                cache_accept: req.headers.get("accept-encoding") || "",
              });
            }

            let content = "";

            if (core[pathname]) content = core[pathname];
            else if (site[pathname]) content = site[pathname];
            else if (pub[pathname]) content = pub[pathname];

            if (content) {
              return await serveWeb({
                content,
                pathname,
                cache_accept: req.headers.get("accept-encoding") || "",
              });
            }
          }
        }

        return new Response(`404 Not Found`, {
          status: 404,
          statusText: "Not Found",
        });
      };

      if (
        !url.pathname.startsWith("/_deploy") &&
        !url.pathname.startsWith("/_prasi")
      ) {
        if (g.deploy.server && index) {
          try {
            return await g.deploy.server.http({
              handle,
              mode: "prod",
              req,
              server: g.server,
              url: { pathname: url.pathname, raw: url },
              index: index,
              prasi,
            });
          } catch (e) {
            console.error(e);
          }
        }
      }

      return handle(req);
    },
  });

  if (process.env.PRASI_MODE === "dev") {
    g.log.info(`http://localhost:${g.server.port}`);
  } else {
    g.log.info(`Started at port: ${g.server.port}`);
  }
};
