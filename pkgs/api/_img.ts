import { dirAsync } from "fs-jetpack";
import { apiContext } from "service-srv";
import { stat } from "fs/promises";
import { dir } from "utils/dir";
import { g } from "utils/global";
import { dirname, parse } from "path";
import sharp from "sharp";

const modified = {} as Record<string, number>;

export const _ = {
  url: "/_img/**",
  async api() {
    const { req } = apiContext(this);
    let res = new Response("NOT FOUND", { status: 404 });

    const w = parseInt(req.query_parameters.w);
    const format = req.query_parameters.f;
    let force = typeof req.query_parameters.force === "string";

    let rpath = decodeURIComponent(req.params._);
    rpath = rpath
      .split("/")
      .map((e) => e.replace(/\.\./gi, ""))
      .filter((e) => !!e)
      .join("/");

    try {
      const filepath = dir(`${g.datadir}/files/${rpath}`);
      const st = await stat(filepath);
      if (st.isFile()) {
        if (
          !modified[filepath] ||
          (modified[filepath] && modified[filepath] !== st.mtimeMs)
        ) {
          modified[filepath] = st.mtimeMs;
          force = true;
        }

        if (!w) {
          const file = Bun.file(filepath);
          return new Response(file);
        } else {
          const original = Bun.file(filepath);

          const p = parse(filepath);
          if (p.ext === ".svg") {
            return new Response(original);
          }

          let file_name = dir(`${g.datadir}/files/upload/thumb/${w}/${rpath}`);
          let file = Bun.file(file_name);
          if (!(await file.exists())) {
            await dirAsync(dirname(file_name));
            force = true;
          }

          if (format === "jpg" && !file_name.endsWith(".jpg")) {
            force = true;
          }

          if (force) {
            const img = sharp(await original.arrayBuffer());
            let out = img.resize({ width: w, fit: "inside" });

            if (format === "jpg" && !file_name.endsWith(".jpg")) {
              file_name = file_name + ".jpg";
              out = out.toFormat("jpg");
            }

            await Bun.write(file_name, await out.toBuffer());
            file = Bun.file(file_name);
          }

          return new Response(file);
        }
      }
    } catch (e: any) {
      return new Response("ERROR:" + e.message, { status: 404 });
    }

    return res;
  },
};
