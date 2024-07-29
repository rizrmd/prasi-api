import { apiContext, createResponse } from "service-srv";
import { SinglePage, g } from "utils/global";
import { gzipAsync } from "utils/gzip";
import { getContent } from "../server/prep-api-ts";
import mime from "mime";

const cache = {
  route: null as any,
  comps: {} as Record<string, any>,
};
export const _ = {
  url: "/_prasi/**",
  async api() {
    const { req, res } = apiContext(this);
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Headers", "content-type");
    const gz = g.deploy.content;
    const parts = req.params._.split("/");

    const action = {
      _: () => {
        res.send({ prasi: "v2" });
      },
      compress: async () => {
        const last = parts.pop();
        if (last === "all") {
          g.compress.mode = "all";
        }
        if (last === "only-gz") {
          g.compress.mode = "only-gz";
        }
        if (last === "off") {
          g.compress.mode = "off";
        }
      },
      code: async () => {
        if (gz) {
          const path = parts.slice(1).join("/");
          if (gz.code.site[path]) {
            const type = mime.getType(path);
            if (type) res.setHeader("content-type", type);
            res.send(
              gz.code.site[path],
              req.headers.get("accept-encoding") || ""
            );
          }
        }
      },
      route: async () => {
        if (gz) {
          if (cache.route) return await responseCompressed(req, cache.route);

          let layout = null as null | SinglePage;
          for (const l of gz.layouts) {
            if (!layout) layout = l;
            if (l.is_default_layout) layout = l;
          }

          cache.route = JSON.stringify({
            site: { ...gz.site, api_url: (gz.site as any)?.config?.api_url },
            urls: gz.pages.map((e) => {
              return { id: e.id, url: e.url };
            }),
            layout: {
              id: layout?.id,
              root: layout?.content_tree,
            },
          });

          return await responseCompressed(req, cache.route);
        }
      },
      page: async () => {
        const page = g.deploy.pages[parts[1]];
        if (page) {
          const res = createResponse(
            JSON.stringify({
              id: page.id,
              root: page.content_tree,
              url: page.url,
            }),
            {
              cache_accept: req.headers.get("accept-encoding") || "",
              high_compression: true,
            }
          );
          return res;
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

        return await responseCompressed(req, JSON.stringify(pages));
      },
      comp: async () => {
        const comps = {} as Record<string, any>;

        const pending = new Set<string>();
        if (req.params.ids) {
          for (const id of req.params.ids) {
            const comp = g.deploy.comps[id];
            if (comp) {
              comps[id] = comp;
            } else if (cache.comps[id]) {
              comps[id] = cache.comps[id];
            } else {
              pending.add(id);
            }
          }
        }

        if (pending.size > 0) {
          try {
            const res = await fetch(
              `https://prasi.avolut.com/prod/452e91b8-c474-4ed2-9c43-447ac8778aa8/_prasi/comp`,
              { method: "POST", body: JSON.stringify({ ids: [...pending] }) }
            );
            for (const [k, v] of Object.entries((await res.json()) as any)) {
              cache.comps[k] = v;
              comps[k] = v;
            }
          } catch (e) {}
        }

        return createResponse(JSON.stringify(comps), {
          cache_accept: req.headers.get("accept-encoding") || "",
          high_compression: true,
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

const responseCompressed = async (req: Request, body: string) => {
  if (req.headers.get("accept-encoding")?.includes("gz")) {
    return new Response(await gzipAsync(body), {
      headers: { "content-encoding": "gzip" },
    });
  }

  return new Response(body);
};
