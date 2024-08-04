import { $ } from "bun";
import { removeAsync } from "fs-jetpack";
import { dir } from "utils/dir";
import { g } from "utils/global";

export const _ = {
  url: "/_zip",
  raw: true,
  async api() {
    await removeAsync(dir(`${g.datadir}/bundle`));

    for (const [directory, files] of Object.entries(g.deploy.content || {})) {
      if (directory !== "code" && directory !== "site") {
        for (const comp of Object.values(files) as any) {
          let filepath = `${g.datadir}/bundle/${directory}/${comp.id}.json`;
          await Bun.write(filepath, JSON.stringify(comp), {
            createPath: true,
          });
        }
      } else if (directory === "site") {
        await Bun.write(
          `${g.datadir}/bundle/${directory}.json`,
          JSON.stringify(files),
          {
            createPath: true,
          }
        );
      } else {
        for (const [filename, content] of Object.entries(files)) {
          let filepath = `${g.datadir}/bundle/${directory}/${filename}`;

          if (content instanceof Buffer || typeof content === "string") {
            await Bun.write(filepath, content, { createPath: true });
          } else {
            for (const [k, v] of Object.entries(content || {})) {
              filepath = `${g.datadir}/bundle/${directory}/${filename}/${k}`;
              if (v instanceof Buffer || typeof v === "string") {
                await Bun.write(filepath, v, { createPath: true });
              } else {
                await Bun.write(filepath, JSON.stringify(v), {
                  createPath: true,
                });
              }
            }
          }
        }
      }
    }

    await $`zip -r bundle.zip .`.quiet().cwd(`${g.datadir}/bundle`);
    return new Response(Bun.file(`${g.datadir}/bundle/bundle.zip`));
  },
};
