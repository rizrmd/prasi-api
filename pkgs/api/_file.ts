import { apiContext } from "service-srv";
import { dir } from "utils/dir";
import { g } from "utils/global";
import { generateIndexHtml } from "../server/serve-web";
import mime from "mime";

export const _ = {
  url: "/_file/**",
  async api() {
    const { req } = apiContext(this);
    const rpath = decodeURIComponent(req.params._);

    let res = new Response("NOT FOUND", { status: 404 });

    const path = dir(`${g.datadir}/upload/${rpath}`);
    const file = Bun.file(path);

    if (await file.exists()) {
      res = new Response(file);
    } else {
      res = new Response("NOT FOUND", { status: 404 });
    }

    const arr = path.split("-");
    const ext = arr.pop();
    const fname = arr.join("-") + "." + ext;
    const ctype = mime.getType(fname);
    if (ctype) {
      res.headers.set("content-type", ctype);
    }

    res.headers.set("Access-Control-Allow-Origin", "*");
    res.headers.set("Access-Control-Allow-Methods", "POST, GET, OPTIONS, PUT");
    res.headers.set("Access-Control-Allow-Headers", "content-type");
    res.headers.set("Access-Control-Allow-Credentials", "true");

    return res;
  },
};
