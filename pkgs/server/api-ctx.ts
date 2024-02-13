import { gzipSync } from "bun";
import brotliPromise from "brotli-wasm"; // Import the default export
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

const cache = {
  gz: {} as Record<string, Uint8Array>,
  br: {} as Record<string, Uint8Array>,
  br_timeout: new Set<string>(),
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
    const content_hash = simpleHash(content);
    if (cache_accept.toLowerCase().includes("br")) {
      if (cache.br[content_hash]) {
        content = cache.br[content_hash];
      } else {
        if (!cache.br_timeout.has(content_hash)) {
          cache.br_timeout.add(content_hash);
          setTimeout(() => {
            cache.br[content_hash] = brotli.compress(Buffer.from(content));
            cache.br_timeout.delete(content_hash);
          });
        }
      }
      headers["content-encoding"] = "br";
    }

    if (
      cache_accept.toLowerCase().includes("gz") &&
      !headers["content-encoding"]
    ) {
      if (cache.gz[content_hash]) {
        content = cache.gz[content_hash];
      } else {
        cache.gz[content_hash] = gzipSync(content);
        content = cache.gz[content_hash];
      }
      headers["content-encoding"] = "gzip";
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

  if (typeof body === "object") {
    res.headers.append("content-type", "application/json");
  }
  for (const [k, v] of Object.entries(headers)) {
    res.headers.append(k, v);
  }

  const cur = existingRes as Response;
  cur.headers.forEach((value, key) => {
    res.headers.append(key, value);
  });

  return res;
};

export const simpleHash = (str: string, seed = 0) => {
  let h1 = 0xdeadbeef ^ seed,
    h2 = 0x41c6ce57 ^ seed;
  for (let i = 0, ch; i < str.length; i++) {
    ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);

  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString();
};
