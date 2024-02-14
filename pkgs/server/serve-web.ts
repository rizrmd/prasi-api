import mime from "mime";



export const serveWeb = async (arg: { pathname: string; content: string }) => {
  const type = mime.getType(arg.pathname);

  return new Response(arg.content, {
    headers: !type ? undefined : { "content-type": type },
  });
};
