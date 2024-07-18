import mime from "mime";
import { apiContext } from "service-srv";
import { dir } from "utils/dir";
import { g } from "utils/global";
import { readdir, stat } from "fs/promises";
import { basename, dirname } from "path";
import {
  dirAsync,
  existsAsync,
  moveAsync,
  removeAsync,
  renameAsync,
} from "fs-jetpack";

export const _ = {
  url: "/_file/**",
  async api() {
    const { req } = apiContext(this);
    let rpath = decodeURIComponent(req.params._);
    rpath = rpath
      .split("/")
      .map((e) => e.replace(/\.\./gi, ""))
      .filter((e) => !!e)
      .join("/");

    let res = new Response("NOT FOUND", { status: 404 });

    if (Object.keys(req.query_parameters).length > 0) {
      await dirAsync(dir(`${g.datadir}/files`));
      const base_dir = dir(`${g.datadir}/files/${rpath}`);
      if (typeof req.query_parameters["move"] === "string") {
        if (rpath) {
          let moveto = req.query_parameters["move"];

          moveto = moveto
            .split("/")
            .map((e) => e.replace(/\.\./gi, ""))
            .filter((e) => !!e)
            .join("/");

          await moveAsync(
            dir(`${g.datadir}/files/${rpath}`),
            dir(`${g.datadir}/files/${moveto}/${basename(rpath)}`)
          );
        }

        return new Response(JSON.stringify({ status: "ok" }), {
          headers: { "content-type": "application/json" },
        });
      } else if (typeof req.query_parameters["del"] === "string") {
        if (rpath) {
          const base_dir = dir(`${g.datadir}/files/${rpath}`);
          if (await existsAsync(base_dir)) {
            const s = await stat(base_dir);
            if (s.isDirectory()) {
              if ((await readdir(base_dir)).length === 0) {
                await removeAsync(base_dir);
              }
            } else {
              await removeAsync(base_dir);
            }
          }
        }

        return new Response(JSON.stringify({ status: "ok" }), {
          headers: { "content-type": "application/json" },
        });
      } else if (typeof req.query_parameters["rename"] === "string") {
        let rename = req.query_parameters["rename"];

        rename = rename
          .split("/")
          .map((e) => e.replace(/\.\./gi, ""))
          .filter((e) => !!e)
          .join("/");

        let newname = "";
        if (rpath) {
          if (await existsAsync(dir(`${g.datadir}/files/${rpath}`))) {
            await renameAsync(dir(`${g.datadir}/files/${rpath}`), rename);
          } else {
            const target = dir(
              `${g.datadir}/files/${dirname(rpath)}/${rename}`
            );
            await dirAsync(target);
          }
          newname = `/${dirname(rpath)}/${rename}`;
        }

        return new Response(JSON.stringify({ newname }), {
          headers: { "content-type": "application/json" },
        });
      } else if (typeof req.query_parameters["dir"] === "string") {
        try {
          const files = [] as {
            name: string;
            type: "dir" | "file";
            size: number;
          }[];
          await Promise.all(
            (
              await readdir(base_dir)
            ).map(async (e) => {
              const s = await stat(dir(`${g.datadir}/files/${rpath}/${e}`));
              files.push({
                name: e,
                type: s.isDirectory() ? "dir" : "file",
                size: s.size,
              });
            })
          );
          return new Response(JSON.stringify(files), {
            headers: { "content-type": "application/json" },
          });
        } catch (e) {
          return new Response(JSON.stringify(null), {
            headers: { "content-type": "application/json" },
          });
        }
      }
    }

    const path = dir(`${g.datadir}/files/${rpath}`);
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
      res.headers.set("content-disposition", `inline; filename="${fname}"`);
      res.headers.set("content-type", ctype);
    }

    res.headers.set("Access-Control-Allow-Origin", "*");
    res.headers.set("Access-Control-Allow-Methods", "POST, GET, OPTIONS, PUT");
    res.headers.set("Access-Control-Allow-Headers", "content-type");
    res.headers.set("Access-Control-Allow-Credentials", "true");

    return res;
  },
};
