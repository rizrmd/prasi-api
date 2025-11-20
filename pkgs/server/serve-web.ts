import mime from "mime";
import { createResponse } from "service-srv";

export const serveWeb = async (arg: {
  pathname: string;
  content: string;
  cache_accept: string;
  opt?: {
    rewrite?: (arg: {
      body: Bun.BodyInputStream;
      headers: Headers | any;
    }) => Bun.BodyInputStream;
  };
}) => {
  console.log(`[DEBUG] serveWeb called for: ${arg.pathname}, content length: ${arg.content.length}`);
  const startTime = Date.now();

  const type = mime.getType(arg.pathname);
  console.log(`[DEBUG] MIME type: ${type}`);

  const response = createResponse(arg.content, {
    cache_accept: arg.cache_accept,
    high_compression: true,
    headers: !type ? undefined : { "content-type": type },
    rewrite: arg.opt?.rewrite,
  });

  const endTime = Date.now();
  console.log(`[DEBUG] createResponse completed in ${endTime - startTime}ms`);

  return response;
};
