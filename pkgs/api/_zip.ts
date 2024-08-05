import { $ } from "bun";
import Database from "bun:sqlite";
import { copyAsync, removeAsync } from "fs-jetpack";
import mime from "mime";
import { dir } from "utils/dir";
import { g } from "utils/global";

export const _ = {
  url: "/_zip",
  raw: true,
  async api() {
    await removeAsync(dir(`${g.datadir}/bundle.sqlite`));
    await copyAsync(
      dir(`pkgs/empty_bundle.sqlite`),
      dir(`${g.datadir}/bundle.sqlite`)
    );
    const db = new Database(dir(`${g.datadir}/bundle.sqlite`));

    const add = ({
      path,
      type,
      content,
    }: {
      path: string;
      type: string;
      content: string | Buffer;
    }) => {
      const query = db.query(
        "INSERT INTO files (path, type, content) VALUES ($path, $type, $content)"
      );

      const res = query.run({
        $path: path.substring(`${g.datadir}/bundle`.length),
        $type: type,
        $content: content,
      });
      console.log(res);
    };

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

    await $`zip bundle.zip bundle.sqlite`.quiet().cwd(`${g.datadir}`);
    return new Response(Bun.file(`${g.datadir}/bundle.zip`));
  },
};
