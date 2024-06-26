import { createResponse } from "service-srv";
import { g } from "../utils/global";

export const serveAPI = async (url: URL, req: Request) => {
  let found = g.router.lookup(url.pathname);
  if (!found?.url) {
    if (!url.pathname.endsWith("/")) {
      found = g.router.lookup(url.pathname + "/");
    }

    if (!found?.url) {
      found = null;
    }
  }

  if (found) {
    const params = { ...found.params };

    let args = found.args.map((e) => {
      return params[e];
    });

    if (req.method !== "GET" && !found.raw) {
      if (!req.headers.get("content-type")?.startsWith("multipart/form-data")) {
        try {
          const json = await req.json();
          if (typeof json === "object") {
            if (Array.isArray(json)) {
              args = json;
              for (let i = 0; i < json.length; i++) {
                const val = json[i];
                if (found.args[i]) {
                  params[found.args[i]] = val;
                }
              }
            } else {
              for (const [k, v] of Object.entries(json as object)) {
                params[k] = v;
              }
              for (const [k, v] of Object.entries(params)) {
                const idx = found.args.findIndex((arg) => arg === k);
                if (idx >= 0) {
                  args[idx] = v;
                }
              }
            }
          }
        } catch (e) {
          console.log(e);
        }
      }
    }

    const current = {
      req,
      res: new Response(),
      ...found,
      params,
    };

    const finalResponse = await current.fn(...args);

    if (finalResponse instanceof Response) {
      return finalResponse;
    }

    if (finalResponse) {
      return createResponse(finalResponse, {
        res: current.res,
      });
    }

    return current.res;
  }
};
