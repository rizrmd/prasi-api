import mime from "mime";
import { createResponse } from "service-srv";

export const serveWeb = async (arg: {
  pathname: string;
  content: string;
  cache_accept: string;
}) => {
  const type = mime.getType(arg.pathname);

  return createResponse(arg.content, {
    cache_accept: arg.cache_accept,
    high_compression: false,
    headers: !type ? undefined : { "content-type": type },
  });
};
