import mime from "mime";

export const serveWeb = (arg: {
  pathname: string;
  content: string | Uint8Array;
  cache_accept: string;
}) => {
  const type = mime.getType(arg.pathname);

  let body: string | Uint8Array = arg.content;
  let contentEncoding: string | undefined;

  if (arg.cache_accept.includes("br") && typeof body === "string") {
    body = Bun.gzipSync(body);
    contentEncoding = "gzip";
  } else if (arg.cache_accept.includes("gz") && typeof body === "string") {
    body = Bun.gzipSync(body);
    contentEncoding = "gzip";
  }

  const headers: Record<string, string> = {};
  if (type) headers["content-type"] = type;
  if (contentEncoding) headers["content-encoding"] = contentEncoding;

  return new Response(body, { headers });
};
