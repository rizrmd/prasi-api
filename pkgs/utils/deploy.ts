import { dirAsync, read, removeAsync, writeAsync } from "fs-jetpack";
import { dir } from "./dir";
import { g } from "./global";
import { gunzipAsync } from "./gzip";
import { createRouter } from "radix3";
import { prodIndex } from "./prod-index";

const decoder = new TextDecoder();
export const deploy = {
  async init() {
    await dirAsync(dir(`app/web/deploy`));

    if (!(await this.has_gz())) {
      await this.run();
    }

    await this.load(this.config.deploy.ts);
  },
  async load(ts: string) {
    console.log(`Loading site: ${this.config.site_id} ${ts}`);

    try {
      g.deploy.gz = JSON.parse(
        decoder.decode(
          await gunzipAsync(
            new Uint8Array(
              await Bun.file(dir(`app/web/deploy/${ts}.gz`)).arrayBuffer()
            )
          )
        )
      );

      g.deploy.index = prodIndex(this.config.site_id);

      if (g.deploy.gz) {
        for (const page of g.deploy.gz.layouts) {
          if (page.is_default_layout) {
            g.deploy.layout = page.content_tree;
            break;
          }
        }
        if (!g.deploy.layout && g.deploy.gz.layouts.length > 0) {
          g.deploy.layout = g.deploy.gz.layouts[0].content_tree;
        }

        g.deploy.router = createRouter();
        g.deploy.pages = {};
        for (const page of g.deploy.gz.pages) {
          g.deploy.pages[page.id] = page;
          g.deploy.router.insert(page.url, page);
        }

        g.deploy.comps = {};
        for (const comp of g.deploy.gz.comps) {
          g.deploy.comps[comp.id] = comp.content_tree;
        }

        if (g.deploy.gz.code.server) {
          setTimeout(async () => {
            if (g.deploy.gz) {
              delete require.cache[dir(`app/web/server/index.js`)];
              await removeAsync(dir(`app/web/server`));
              await dirAsync(dir(`app/web/server`));
              for (const [k, v] of Object.entries(g.deploy.gz.code.server)) {
                await writeAsync(dir(`app/web/server/${k}`), v);
              }
            }
          }, 300);
        }
      }
    } catch (e) {
      console.log("Failed to load site", this.config.site_id);
    }
  },
  async run() {
    if (!this.config.site_id) {
      console.log("site_id is not found on app/web/config.json");
      return;
    }

    let base_url = "https://prasi.avolut.com";
    if (g.mode === "dev") {
      base_url = "http://localhost:4550";
    }

    console.log(
      `Downloading site deploy: ${this.config.site_id} [ts: ${this.config.deploy.ts}]`
    );
    const res = await fetch(
      `${base_url}/prod-zip/${this.config.site_id}?ts=${Date.now()}`
    );
    const ts = Date.now();

    const file = Bun.file(dir(`app/web/deploy/${ts}.gz`));
    await Bun.write(file, await res.arrayBuffer());
    this.config.deploy.ts = ts + "";

    await this.saveConfig();
  },
  get config() {
    if (!g.deploy) {
      g.deploy = {
        comps: {},
        layout: null,
        pages: {},
        router: createRouter(),
        config: { deploy: { ts: "" }, site_id: "" },
        init: false,
        raw: null,
        gz: null,
        server: null,
        index: null,
      };
    }

    if (!g.deploy.init) {
      g.deploy.init = true;
      g.deploy.raw = read(dir(`app/web/config.json`), "json");

      if (g.deploy.raw) {
        for (const [k, v] of Object.entries(g.deploy.raw)) {
          (g.deploy.config as any)[k] = v;
        }
      }
    }

    return g.deploy.config;
  },
  saveConfig() {
    return Bun.write(
      Bun.file(dir(`app/web/config.json`)),
      JSON.stringify(this.config, null, 2)
    );
  },
  has_gz() {
    if (this.config.deploy.ts) {
      return Bun.file(
        dir(`app/web/deploy/${this.config.deploy.ts}.gz`)
      ).exists();
    }

    return false;
  },
};
