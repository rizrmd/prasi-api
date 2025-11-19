import {
  dirAsync,
  exists,
  existsAsync,
  read,
  removeAsync,
  writeAsync,
} from "fs-jetpack";
import { decode } from "msgpackr";
import { createRouter } from "radix3";
import { startBrCompress } from "./br-load";
import { dir } from "./dir";
import { g } from "./global";
import { gunzipAsync } from "./gzip";

const decoder = new TextDecoder();

const createDbProxy = () => {
  return new Proxy({}, {
    get(target, prop) {
      if (!g.db) {
        if (typeof prop === 'string') {
          return new Proxy({}, {
            get(target, method) {
              return async () => {
                throw new Error(`Database connection not available. Cannot execute ${prop}.${String(method)}`);
              };
            }
          });
        }
        return undefined;
      }
      return g.db[prop];
    }
  });
};

export const deploy = {
  async init(load_from?: string) {
    await dirAsync(dir(`app/web/deploy`));

    if (!(await this.has_gz())) {
      await this.run();
    }

    await this.load(this.config.deploy.ts);
  },
  async load(ts: string) {
    console.log(`[DEBUG] Loading site: ${this.config.site_id} ${ts}`);

    try {
      // Check if we have a new ZIP format deployment
      if (await Bun.file(`app/web/deploy/${ts}.zip`).exists()) {
        console.log(`[DEBUG] Found ZIP deployment, loading: ${ts}.zip`);
        await this.loadFromZip(ts);
        console.log(`[DEBUG] ZIP load completed, proceeding with content setup`);
      } else if (await Bun.file(`app/web/deploy/${ts}.mpack`).exists()) {
        console.log(`[DEBUG] Loading legacy msgpack deployment: ${ts}.gz`);
        g.deploy.content = decode(
          await gunzipAsync(
            new Uint8Array(
              await Bun.file(dir(`app/web/deploy/${ts}.gz`)).arrayBuffer()
            )
          )
        );
      } else if (await Bun.file(`app/web/deploy/${ts}.gz`).exists()) {
        console.log(`[DEBUG] Loading legacy JSON deployment: ${ts}.gz`);
        g.deploy.content = JSON.parse(
          decoder.decode(
            new Uint8Array(
              await gunzipAsync(
                new Uint8Array(
                  await Bun.file(dir(`app/web/deploy/${ts}.gz`)).arrayBuffer()
                )
              )
            )
          )
        );
      } else {
        throw new Error(`No deployment file found for timestamp: ${ts}`);
      }

      if (g.deploy.content) {
        console.log(`[DEBUG] Setting up cache and compression...`);
        g.cache = {
          br: {},
          gz: {},
          br_progress: {
            pending: {},
            running: false,
            timeout: null,
          },
        };
        startBrCompress();
        console.log(`[DEBUG] Compression started`);

        if (exists(dir("public"))) {
          await removeAsync(dir("public"));
        }
        if (g.deploy.content.public) {
          console.log(`[DEBUG] Creating public directory and writing ${Object.keys(g.deploy.content.public).length} files`);
          await dirAsync(dir("public"));
          for (const [k, v] of Object.entries(g.deploy.content.public)) {
            await writeAsync(dir(`public/${k}`), v);
          }
        }
        console.log(`[DEBUG] Public files setup completed`);

        for (const page of g.deploy.content.layouts) {
          if (page.is_default_layout) {
            g.deploy.layout = page.content_tree;
            break;
          }
        }
        if (!g.deploy.layout && g.deploy.content.layouts.length > 0) {
          g.deploy.layout = g.deploy.content.layouts[0].content_tree;
        }

        g.deploy.router = createRouter();
        g.deploy.pages = {};
        for (const page of g.deploy.content.pages) {
          g.deploy.pages[page.id] = page;
          g.deploy.router.insert(page.url, page);
        }
        console.log(`[DEBUG] Router and pages setup completed`);

        g.deploy.comps = {};
        for (const comp of g.deploy.content.comps) {
          g.deploy.comps[comp.id] = comp.content_tree;
        }
        console.log(`[DEBUG] Components setup completed`);

        if (g.deploy.content.code.server) {
          setTimeout(async () => {
            if (g.deploy.content) {
              delete require.cache[dir(`app/web/server/index.js`)];
              await removeAsync(dir(`app/web/server`));
              await dirAsync(dir(`app/web/server`));
              for (const [k, v] of Object.entries(
                g.deploy.content.code.server
              )) {
                await writeAsync(dir(`app/web/server/${k}`), v);
              }

              if (await existsAsync(dir(`app/web/server/index.js`))) {
                const res = require(dir(`app/web/server/index.js`));
                if (res && typeof res.server === "object") {
                  g.deploy.server = res.server;
                }
              }

              const dbProxy = createDbProxy();
              
              if (g.server) {
                await g.deploy.server?.init?.({ port: g.server.port, db: dbProxy });
              } else {
                const inv = setInterval(async () => {
                  if (g.server) {
                    clearInterval(inv);
                    await g.deploy.server?.init?.({ port: g.server.port, db: dbProxy });
                  }
                }, 1000);
              }
            }
          }, 300);
        }
        console.log(`[DEBUG] Site load completed successfully!`);
      }
    } catch (e) {
      console.log("[ERROR] Failed to load site", this.config.site_id);
      console.error("[ERROR] Error details:", e.message);
      console.error("[ERROR] Stack trace:", e.stack);
    }
  },
  async run(load_from?: string) {
    if (!this.config.site_id) {
      console.log("site_id is not found on app/web/config.json");
      return;
    }
    let buf: ArrayBuffer | null = null;
    if (!load_from) {
      let base_url = "https://prasi.avolut.com";
      if (g.mode === "dev") {
        base_url = "http://localhost:4550";
      }

      console.log(
        `Downloading site deploy ZIP: ${this.config.site_id} [ts: ${this.config.deploy.ts}] ${base_url}`
      );
      const res = await fetch(
        `${base_url}/prod-zip/${this.config.site_id}?ts=${Date.now()}`
      );
      buf = await res.arrayBuffer();
    } else {
      const res = await fetch(load_from);
      buf = await res.arrayBuffer();
    }

    if (!buf) {
      console.log("Failed to download site deploy");
      return;
    }
    const ts = Date.now();
    const file = Bun.file(dir(`app/web/deploy/${ts}.zip`));
    await Bun.write(file, buf);
    await Bun.write(dir(`app/web/deploy/${ts}.info`), JSON.stringify({
      format: "zip",
      timestamp: ts,
      site_id: this.config.site_id
    }, null, 2));
    this.config.deploy.ts = ts + "";

    await this.saveConfig();
  },
  async loadFromZip(ts: string) {
    try {
      console.log(`[DEBUG] Starting ZIP load for timestamp: ${ts}`);
      const zipFile = Bun.file(dir(`app/web/deploy/${ts}.zip`));

      if (!await zipFile.exists()) {
        throw new Error(`ZIP file not found: ${zipFile.path}`);
      }

      console.log(`[DEBUG] ZIP file exists, size: ${await zipFile.size} bytes`);

      // Use Bun's built-in ZIP reading capability
      console.log(`[DEBUG] Reading ZIP entries...`);
      const zipEntries = await zipFile.entries();
      console.log(`[DEBUG] ZIP entries loaded: ${zipEntries.length} entries`);

      // Create deploy content structure
      g.deploy.content = {
        layouts: [],
        pages: [],
        comps: [],
        site: null,
        public: {},
        code: {
          server: {},
          site: {},
          core: {},
        },
      };

      let foundMetadata = false;
      let loadedFiles = 0;

      // Process each entry in the ZIP
      for (const entry of zipEntries) {
        const path = entry[0];
        const zipEntry = entry[1];

        if (path.endsWith('/')) {
          // Skip directory entries
          continue;
        }

        try {
          const content = await zipEntry.arrayBuffer();
          const fileContent = new Uint8Array(content);

          console.log(`[DEBUG] Processing file: ${path} (${fileContent.length} bytes)`);

          if (path === 'metadata.json') {
            console.log(`[DEBUG] Found metadata.json, parsing content...`);
            const metadataStr = new TextDecoder().decode(fileContent);
            const metadata = JSON.parse(metadataStr);

            console.log(`[DEBUG] Parsed metadata:`, {
              layouts: metadata.layouts?.length || 0,
              pages: metadata.pages?.length || 0,
              components: metadata.components?.length || 0,
              hasSite: !!metadata.site
            });

            // Update deploy content with metadata
            g.deploy.content.layouts = metadata.layouts || [];
            g.deploy.content.pages = metadata.pages || [];
            g.deploy.content.comps = metadata.components || [];
            g.deploy.content.site = metadata.site;
            foundMetadata = true;
          } else if (path.startsWith('public/')) {
            const relativePath = path.slice(7); // Remove 'public/' prefix
            const binaryExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.ico', '.svg', '.woff', '.woff2', '.ttf', '.eot', '.js', '.css', '.map'];
            const isBinary = binaryExtensions.some(ext => relativePath.toLowerCase().endsWith(ext));

            if (isBinary) {
              g.deploy.content.public[relativePath] = fileContent;
            } else {
              g.deploy.content.public[relativePath] = new TextDecoder().decode(fileContent);
            }
          } else if (path.startsWith('server/')) {
            const relativePath = path.slice(7); // Remove 'server/' prefix
            const binaryExtensions = ['.js', '.map', '.json'];
            const isBinary = binaryExtensions.some(ext => relativePath.toLowerCase().endsWith(ext));

            if (isBinary) {
              g.deploy.content.code.server[relativePath] = fileContent;
            } else {
              g.deploy.content.code.server[relativePath] = new TextDecoder().decode(fileContent);
            }
          } else if (path.startsWith('site/')) {
            const relativePath = path.slice(5); // Remove 'site/' prefix
            const binaryExtensions = ['.js', '.css', '.map', '.json', '.woff', '.woff2', '.ttf'];
            const isBinary = binaryExtensions.some(ext => relativePath.toLowerCase().endsWith(ext));

            if (isBinary) {
              g.deploy.content.code.site[relativePath] = fileContent;
            } else {
              g.deploy.content.code.site[relativePath] = new TextDecoder().decode(fileContent);
            }
          } else if (path.startsWith('core/')) {
            const relativePath = path.slice(6); // Remove 'core/' prefix
            const binaryExtensions = ['.js', '.json'];
            const isBinary = binaryExtensions.some(ext => relativePath.toLowerCase().endsWith(ext));

            if (isBinary) {
              g.deploy.content.code.core[relativePath] = fileContent;
            } else {
              g.deploy.content.code.core[relativePath] = new TextDecoder().decode(fileContent);
            }
          }

          loadedFiles++;
        } catch (fileError) {
          console.warn(`[WARN] Failed to process file ${path}:`, fileError.message);
        }
      }

      console.log(`[DEBUG] ZIP processing completed: ${loadedFiles} files loaded`);

      if (!foundMetadata) {
        console.log(`[DEBUG] Available files in ZIP:`);
        for (const entry of zipEntries) {
          console.log(`[DEBUG]  - ${entry[0]}`);
        }
        throw new Error("metadata.json not found in ZIP file");
      }

      console.log(`[DEBUG] Successfully loaded ZIP deployment`);
      console.log(`[DEBUG] Final content summary:`, {
        layouts: g.deploy.content.layouts?.length || 0,
        pages: g.deploy.content.pages?.length || 0,
        comps: g.deploy.content.comps?.length || 0,
        publicFiles: Object.keys(g.deploy.content.public).length,
        serverFiles: Object.keys(g.deploy.content.code.server).length,
        siteFiles: Object.keys(g.deploy.content.code.site).length,
        coreFiles: Object.keys(g.deploy.content.code.core).length,
      });

    } catch (error) {
      console.error("[ERROR] Failed to load ZIP deployment:", error);
      console.error("[ERROR] Stack trace:", error.stack);
      throw error;
    }
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
        content: null,
        server: null,
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
      return (
        Bun.file(dir(`app/web/deploy/${this.config.deploy.ts}.zip`)).exists() ||
        Bun.file(dir(`app/web/deploy/${this.config.deploy.ts}.gz`)).exists()
      );
    }

    return false;
  },
};
