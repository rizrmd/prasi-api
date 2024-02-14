import { readAsync } from "fs-jetpack";
import { apiContext } from "service-srv";
import { g } from "utils/global";
import { dir } from "utils/dir";
import { gzipAsync } from "utils/gzip";

const generated = {
  "load.json": "",
  "load.js.dev": "",
  "load.js.prod": "",
};

export const _ = {
  url: "/_prasi/**",
  async api() {
    const { req, res } = apiContext(this);
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Headers", "content-type");
    const gz = g.deploy.gz;
    const parts = req.params._.split("/");

    const action = {
      _: () => {
        res.send({ prasi: "v2" });
      },
      route: async () => {
        if (gz) {
          let layout = null as any;
          for (const l of gz.layouts) {
            if (!layout) layout = l;
            if (l.is_default_layout) layout = l;
          }

          const result = await gzipAsync(
            JSON.stringify({
              site: { ...gz.site, api_url: (gz.site as any)?.config?.api_url },
              urls: gz.pages.map((e) => {
                return { id: e.id, url: e.url };
              }),
              layout,
            })
          );

          return new Response(result, { headers: res.headers });
        }
      },
      page: async () => {
        const page = g.deploy.pages[parts[1]];
        if (page) {
          const result = await gzipAsync(
            JSON.stringify({
              id: page.id,
              root: page.content_tree,
              url: page.url,
            })
          );

          return new Response(result, { headers: res.headers });
        }
      },
      pages: async () => {
        const pages = [];
        if (req.params.ids) {
          for (const id of req.params.ids) {
            const page = g.deploy.pages[id];
            if (page) {
              pages.push({
                id: page.id,
                root: page.content_tree,
                url: page.url,
              });
            }
          }
        }

        return new Response(await gzipAsync(JSON.stringify(pages)), {
          headers: res.headers,
        });
      },
      comp: async () => {
        const comps = {} as Record<string, any>;
        if (req.params.ids) {
          for (const id of req.params.ids) {
            const comp = g.deploy.comps[id];
            if (comp) {
              comps[id] = comp;
            }
          }
        }

        return new Response(await gzipAsync(JSON.stringify(comps)), {
          headers: res.headers,
        });
      },
      "load.json": async () => {
        res.setHeader("content-type", "application/json");
        res.send(
          await getContent("load.json"),
          req.headers.get("accept-encoding") || ""
        );
      },
      "load.js": async () => {
        res.setHeader("content-type", "text/javascript");

        const url = req.query_parameters["url"]
          ? JSON.stringify(req.query_parameters["url"])
          : "undefined";

        if (req.query_parameters["dev"]) {
          res.send(
            await getContent("load.js.dev", url),
            req.headers.get("accept-encoding") || ""
          );
        } else {
          res.send(
            await getContent("load.js.prod", url),
            req.headers.get("accept-encoding") || ""
          );
        }
      },
    };

    const pathname: keyof typeof action = parts[0] as any;
    const run = action[pathname];

    if (run) {
      return await run();
    }
  },
};

export const getApiEntry = () => {
  const res: any = {};
  for (const [k, v] of Object.entries(g.api)) {
    const name = k.substring(0, k.length - 3);
    res[name] = { ...v, name, path: `app/srv/api/${v.path}` };
  }

  return res;
};

const getContent = async (type: keyof typeof generated, url?: string) => {
  if (type === "load.json") {
    if (!generated[type])
      generated[type] = JSON.stringify({
        apiEntry: getApiEntry(),
        apiTypes: (await getApiTypes()) || "",
        prismaTypes: {
          "prisma.d.ts": await getPrisma("prisma"),
          "runtime/index.d.ts": await getPrisma("runtime"),
          "runtime/library.d.ts": await getPrisma("library"),
        },
      });
  } else if (type === "load.js.dev") {
    if (!generated[type])
      generated[type] = `\
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
    if (!generated[type])
      generated[type] = `\
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
  return generated[type];
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
