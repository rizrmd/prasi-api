import { apiContext } from "service-srv";
import { SinglePage, g } from "utils/global";
import { gzipAsync } from "utils/gzip";
import { getContent } from "../server/prep-api-ts";
import mime from "mime";

const cache = {
  route: null as any,
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
          if (cache.route) return cache.route;

          let layout = null as null | SinglePage;
          for (const l of gz.layouts) {
            if (!layout) layout = l;
            if (l.is_default_layout) layout = l;
          }

          cache.route = await responseCompressed(
            req,
            JSON.stringify({
              site: { ...gz.site, api_url: (gz.site as any)?.config?.api_url },
              urls: gz.pages.map((e) => {
                return { id: e.id, url: e.url };
              }),
              layout: {
                id: layout?.id,
                root: layout?.content_tree,
              },
            })
          );

          return cache.route;
        }
      },
      page: async () => {
        const page = g.deploy.pages[parts[1]];
        if (page) {
          return await responseCompressed(
            req,
            JSON.stringify({
              id: page.id,
              root: page.content_tree,
              url: page.url,
            })
          );
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
        if (req.params.ids) {
          for (const id of req.params.ids) {
            const comp = g.deploy.comps[id];
            if (comp) {
              comps[id] = comp;
            }
          }
        }

        return await responseCompressed(req, JSON.stringify(comps));
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
