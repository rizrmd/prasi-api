import brotliPromise from "brotli-wasm"; // Import the default export
import { simpleHash } from "utils/cache";
import { g } from "utils/global";
const brotli = await brotliPromise;

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
        ctx.res = createResponse(ctx.res, body, cache_accept);
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
  existingRes: any,
  body: any,
  cache_accept?: string
) => {
  const status =
    typeof existingRes._status === "number" ? existingRes._status : undefined;

  let content: any = typeof body === "string" ? body : JSON.stringify(body);
  const headers = {} as Record<string, string>;
  if (cache_accept) {
    if (g.mode === "prod" && cache_accept.toLowerCase().includes("br")) {
      const content_hash = simpleHash(content);

      if (g.cache.br[content_hash]) {
        content = g.cache.br[content_hash];
        headers["content-encoding"] = "br";
      } else {
        if (!g.cache.br_timeout.has(content_hash)) {
          g.cache.br_timeout.add(content_hash);
          setTimeout(() => {
            g.cache.br[content_hash] = brotli.compress(Buffer.from(content));
            g.cache.br_timeout.delete(content_hash);
          });
        }
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
  const cur = existingRes as Response;
  cur.headers.forEach((value, key) => {
    res.headers.append(key, value);
  });

  if (typeof body === "object" && !res.headers.has("content-type")) {
    res.headers.append("content-type", "application/json");
  }

  return res;
};
