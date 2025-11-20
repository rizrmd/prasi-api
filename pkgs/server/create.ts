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
import exitHook from "exit-hook";

export const createServer = async () => {
  console.log(`[DEBUG] Starting server creation...`);
  g.router = createRouter({ strictTrailingSlash: true });
  g.api = {};

  const scan = async (path: string, root?: string) => {
    console.log(`[DEBUG] Scanning API directory: ${path}`);
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
  console.log(`[DEBUG] Starting API directory scans...`);
  await scan(dir(`app/srv/api`));
  console.log(`[DEBUG] app/srv/api scan completed`);
  await scan(dir(`pkgs/api`));
  console.log(`[DEBUG] pkgs/api scan completed`);

  console.log(`[DEBUG] Creating server functions...`);
  g.createServer = (arg) => {
    return async (site_id: string) => {
      return arg;
    };
  };

  if (g.mode === "prod") {
    exitHook((signal) => {
      g.server.stop();
    });
  }

  console.log(`[DEBUG] Ensuring server is not running...`);
  await ensureNotRunning();

  console.log(`[DEBUG] Starting Bun.serve on port ${g.port}...`);

  // First try a minimal test server to isolate Bun.serve issues
  console.log(`[DEBUG] Creating minimal test server first...`);
  try {
    const testServer = Bun.serve({
      port: 3001, // Use different port for testing
      hostname: "0.0.0.0",
      development: false,
      fetch(req) {
        console.log(`[TEST] Minimal server request: ${req.method} ${req.url}`);
        return new Response("Test server working!", {
          status: 200,
          headers: { "Content-Type": "text/plain" }
        });
      },
    });
    console.log(`[DEBUG] ✓ Test server listening on ${testServer.hostname}:${testServer.port}`);
  } catch (testError) {
    console.error(`[ERROR] Test server failed:`, testError);
  }

  try {
    g.server = Bun.serve({
      port: g.port,
      maxRequestBodySize: 1024 * 1024 * 128,
      hostname: "0.0.0.0", // Explicitly bind to all interfaces
      development: false, // Force production mode
      async fetch(req) {
        console.log(`[DEBUG] === FETCH HANDLER CALLED ===`);
        console.log(`[DEBUG] Request received: ${req.method} ${req.url}`);
        console.log(`[DEBUG] Request headers:`, Object.fromEntries(req.headers.entries()));

        // IMMEDIATE RESPONSE FOR TESTING
        if (req.url === '/') {
          console.log(`[DEBUG] Returning immediate test response for root path`);
          return new Response('Test response working!', {
            status: 200,
            headers: { 'Content-Type': 'text/plain' }
          });
        }

        try {
          console.log(`[DEBUG] Processing normal request flow...`);
          const url = new URL(req.url) as URL;
          url.pathname = url.pathname.replace(/\/+/g, "/");
          console.log(`[DEBUG] Processed URL: ${url.pathname}`);

          console.log(`[DEBUG] Creating prasi object...`);
          const prasi = {};

          console.log(`[DEBUG] Creating index...`);
          const index = prodIndex(g.deploy.config.site_id, prasi);
          console.log(`[DEBUG] Index created successfully`);

      const handle = async (
        req: Request,
        opt?: {
          rewrite?: (arg: {
            body: Bun.BodyInit;
            headers: Headers | any;
          }) => Bun.BodyInit;
        }
      ) => {
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
              opt,
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
                opt,
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
                opt,
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
        } catch (fetchError) {
          console.error(`[ERROR] Fetch handler error:`, fetchError);
          console.error(`[ERROR] Stack trace:`, fetchError.stack);
          return new Response(`Fetch Handler Error: ${fetchError.message}`, {
            status: 500,
            statusText: "Internal Server Error",
          });
        }
      },
      error(error) {
        console.error(`[ERROR] Server error:`, error);
        return new Response(`Internal Server Error: ${error.message}`, {
          status: 500,
          statusText: "Internal Server Error",
        });
      },
    });

    console.log(`[DEBUG] Server object created successfully!`);
    console.log(`[DEBUG] Server actually listening on ${g.server.hostname}:${g.server.port}`);

    // Verify the server is actually listening
    setTimeout(() => {
      if (g.server && g.server.port === g.port) {
        console.log(`[DEBUG] ✓ Server verified to be listening on port ${g.port}`);
      } else {
        console.error(`[ERROR] ✗ Server not properly bound to port ${g.port}`);
      }
    }, 100);

  } catch (error) {
    console.error(`[ERROR] Failed to start Bun.serve:`, error);
    throw error;
  }

  if (process.env.PRASI_MODE === "dev") {
    g.log.info(`http://localhost:${g.server.port}`);
    console.log(`[DEBUG] Server started in DEV mode`);
  } else {
    g.log.info(`Started at port: ${g.server.port}`);
    console.log(`[DEBUG] Server started in PROD mode`);
  }
  console.log(`[DEBUG] createServer function completed successfully!`);
};
