import { simpleHash } from "utils/cache";
import { g } from "utils/global";
import { loadCachedBr } from "utils/br-load";

const parseQueryParams = (ctx: any) => {
  const pageHref = ctx.req.url;
  const searchParams = new URLSearchParams(
    pageHref.substring(pageHref.indexOf("?"))
  );
  const result: any = {};
  searchParams.forEach((v, k) => {
    result[k] = v;
  });

  return result as any;
};
export const apiContext = (ctx: any) => {
  ctx.req.params = ctx.params;

  if (ctx.params["_0"]) {
    ctx.params["_"] = ctx.params["_0"];
    delete ctx.params["_0"];
  }

  ctx.req.query_parameters = parseQueryParams(ctx);
  return {
    req: ctx.req as Request & { params: any; query_parameters: any },
    res: {
      ...ctx.res,
      send: (body, cache_accept?: string) => {
        ctx.res = createResponse(body, { cache_accept, res: ctx.res });
      },
      sendStatus: (code: number) => {
        ctx.res._status = code;
      },
      setHeader: (key: string, value: string) => {
        ctx.res.headers.append(key, value);
      },
    } as Response & {
      send: (body?: string | object, cache_accept?: string) => void;
      setHeader: (key: string, value: string) => void;
      sendStatus: (code: number) => void;
    },
  };
};

(BigInt.prototype as any).toJSON = function (): string {
  return `BigInt::` + this.toString();
};

export const createResponse = (
  body: any,
  opt?: {
    cache_accept?: string;
    headers?: any;
    res?: any;
    br?: boolean;
  }
) => {
  const status =
    typeof opt?.res?._status === "number" ? opt?.res?._status : undefined;

  let content: any = typeof body === "string" ? body : JSON.stringify(body);
  const headers = { ...(opt?.headers || {}) } as Record<string, string>;
  if (opt?.cache_accept) {
    let cached = false;
    if (opt?.br && opt.cache_accept.toLowerCase().includes("br")) {
      const content_hash = simpleHash(content);

      if (!g.cache.br[content_hash]) {
        loadCachedBr(content_hash, content);
      }

      if (g.cache.br[content_hash]) {
        cached = true;
        content = g.cache.br[content_hash];
        headers["content-encoding"] = "br";
      }
    }

    if (!cached && opt.cache_accept.toLowerCase().includes("gz")) {
      const content_hash = simpleHash(content);

      if (!g.cache.gz[content_hash]) {
        g.cache.gz[content_hash] = Bun.gzipSync(content);
      }

      if (g.cache.gz[content_hash]) {
        cached = true;
        content = g.cache.gz[content_hash];
        headers["content-encoding"] = "gzip";
      }
    }
  }

  let res = new Response(
    content,
    status
      ? {
          status,
        }
      : undefined
  );

  for (const [k, v] of Object.entries(headers)) {
    res.headers.append(k, v);
  }
  const cur = opt?.res as Response;
  if (cur) {
    cur.headers.forEach((value, key) => {
      res.headers.append(key, value);
    });
  }

  if (typeof body === "object" && !res.headers.has("content-type")) {
    res.headers.append("content-type", "application/json");
  }

  return res;
};
