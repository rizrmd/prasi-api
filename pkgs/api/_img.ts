import { dirAsync } from "fs-jetpack";
import { apiContext } from "service-srv";
import { dir } from "utils/dir";
import { g } from "utils/global";
import { dirname, parse } from "path";
import sharp from "sharp";

export const _ = {
  url: "/_img/**",
  async api() {
    const { req } = apiContext(this);
    let res = new Response("NOT FOUND", { status: 404 });

    const w = parseInt(req.query_parameters.w);
    let force = typeof req.query_parameters.force === "string";

    let rpath = decodeURIComponent(req.params._);
    rpath = rpath
      .split("/")
      .map((e) => e.replace(/\.\./gi, ""))
      .filter((e) => !!e)
      .join("/");

    if (!w) {
      const file = Bun.file(dir(`${g.datadir}/files/${rpath}`));
      return new Response(file);
    } else {
      const original = Bun.file(dir(`${g.datadir}/files/${rpath}`));
      if (await original.exists()) {
        const p = parse(dir(`${g.datadir}/files/${rpath}`));
        if (p.ext === ".svg") {
          return new Response(original);
        }

        const file_name = dir(`${g.datadir}/files/thumb/${w}/${rpath}`);
        let file = Bun.file(file_name);
        if (!(await file.exists())) {
          await dirAsync(dirname(file_name));
          force = true;
        }

        if (force) {
          const img = sharp(await original.arrayBuffer());
          const out = await img.resize({ width: w, fit: "inside" }).toBuffer();
          await Bun.write(file_name, out);
          file = Bun.file(file_name);
        }

        return new Response(file);
      }
    }

    return res;
  },
};
