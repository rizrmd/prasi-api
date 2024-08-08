import { $ } from "bun";
import Database from "bun:sqlite";
import { copyAsync } from "fs-jetpack";
import mime from "mime";
import { deploy } from "utils/deploy";
import { dir } from "utils/dir";
import { g, SinglePage } from "utils/global";
import { getContent } from "../server/prep-api-ts";

export const _ = {
  url: "/_zip",
  raw: true,
  async api() {
    await $`rm bundle*`.nothrow().quiet().cwd(`${g.datadir}`);
    await copyAsync(
      dir(`pkgs/empty_bundle.sqlite`),
      dir(`${g.datadir}/bundle.sqlite`)
    );
    const db = new Database(dir(`${g.datadir}/bundle.sqlite`));

    const ts = g.deploy.config.deploy.ts;
    const add = ({
      path,
      type,
      content,
    }: {
      path: string;
      type: string;
      content: string | Buffer;
    }) => {
      if (path) {
        const query = db.query(
          "INSERT INTO files (path, type, content) VALUES ($path, $type, $content)"
        );
        query.run({
          $path: path.startsWith(g.datadir)
            ? path.substring(`${g.datadir}/bundle`.length)
            : path,
          $type: type,
          $content: content,
        });
      }
    };

    add({ path: "version", type: "", content: deploy.config.deploy.ts + "" });
    add({ path: "site_id", type: "", content: deploy.config.site_id + "" });
    add({
      path: "base_url",
      type: "",
      content: g.deploy.content?.site?.config?.api_url || "",
    });
    const gz = g.deploy.content;

    if (gz) {
      let layout = null as null | SinglePage;
      for (const l of gz.layouts) {
        if (!layout) layout = l;
        if (l.is_default_layout) layout = l;
      }

      let api_url = (gz.site as any)?.config?.api_url;

      add({
        path: "route",
        type: "",
        content: JSON.stringify({
          site: {
            ...gz.site,
            api_url,
          },
          urls: gz.pages.map((e) => {
            return { id: e.id, url: e.url };
          }),
          layout: {
            id: layout?.id,
            root: layout?.content_tree,
          },
        }),
      });

      add({
        path: "load-js",
        type: "",
        content: await getContent("load.js.prod", `"${api_url}"`),
      });
    }

    for (const [directory, files] of Object.entries(g.deploy.content || {})) {
      if (directory !== "code" && directory !== "site") {
        for (const comp of Object.values(files) as any) {
          let filepath = `${g.datadir}/bundle/${directory}/${comp.id}.json`;

          add({
            path: filepath,
            type: mime.getType(filepath) || "text/plain",
            content: JSON.stringify(comp),
          });
        }
      } else if (directory === "site") {
        const filepath = `${g.datadir}/bundle/${directory}.json`;
        add({
          path: filepath,
          type: mime.getType(filepath) || "text/plain",
          content: JSON.stringify(files),
        });
      } else {
        for (const [filename, content] of Object.entries(files)) {
          let filepath = `${g.datadir}/bundle/${directory}/${filename}`;

          if (content instanceof Buffer || typeof content === "string") {
            add({
              path: filepath,
              type: mime.getType(filepath) || "text/plain",
              content,
            });
          } else {
            for (const [k, v] of Object.entries(content || {})) {
              filepath = `${g.datadir}/bundle/${directory}/${filename}/${k}`;
              if (v instanceof Buffer || typeof v === "string") {
                add({
                  path: filepath,
                  type: mime.getType(filepath) || "text/plain",
                  content: v,
                });
              } else {
                add({
                  path: filepath,
                  type: mime.getType(filepath) || "text/plain",
                  content: JSON.stringify(v),
                });
              }
            }
          }
        }
      }
    }

    await $`zip "bundle-${ts}.zip" bundle.sqlite`
      .nothrow()
      .quiet()
      .cwd(`${g.datadir}`);
    return new Response(Bun.file(`${g.datadir}/bundle-${ts}.zip`));
  },
};
