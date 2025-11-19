import {
  dirAsync,
  exists,
  existsAsync,
  read,
  removeAsync,
  writeAsync,
} from "fs-jetpack";
import { readdir } from "fs/promises";
import { decode } from "msgpackr";
import { createRouter } from "radix3";
import { startBrCompress } from "./br-load";
import { dir } from "./dir";
import { g } from "./global";
import { gunzipAsync } from "./gzip";
import * as unzipper from "unzipper";

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
      const zipBuffer = Buffer.from(await zipFile.arrayBuffer());

      // Create a directory for extraction
      const extractDir = dir(`app/web/deploy/${ts}_extracted`);
      console.log(`[DEBUG] Creating extract directory: ${extractDir}`);
      await dirAsync(extractDir);

      // Extract ZIP file
      console.log(`[DEBUG] Starting ZIP extraction...`);
      const directory = await unzipper.Open.buffer(zipBuffer);
      console.log(`[DEBUG] ZIP opened, files count: ${directory.files.length}`);

      await directory.extract({ path: extractDir });
      console.log(`[DEBUG] ZIP extraction completed`);

      // Load metadata from ZIP
      const metadataPath = dir(`${extractDir}/metadata.json`);
      console.log(`[DEBUG] Looking for metadata at: ${metadataPath}`);

      if (await Bun.file(metadataPath).exists()) {
        console.log(`[DEBUG] Found metadata.json, reading content...`);
        const metadataContent = await Bun.file(metadataPath).text();
        console.log(`[DEBUG] Metadata content length: ${metadataContent.length} chars`);
        const metadata = JSON.parse(metadataContent);

        console.log(`[DEBUG] Parsed metadata:`, {
          layouts: metadata.layouts?.length || 0,
          pages: metadata.pages?.length || 0,
          components: metadata.components?.length || 0,
          hasSite: !!metadata.site
        });

        // Set up the deploy content structure
        g.deploy.content = {
          layouts: metadata.layouts || [],
          pages: metadata.pages || [],
          comps: metadata.components || [],
          site: metadata.site,
          public: {},
          code: {
            server: {},
            site: {},
            core: {},
          },
        };

        // Load public files
        const publicDir = dir(`${extractDir}/public`);
        if (await existsAsync(publicDir)) {
          console.log(`[DEBUG] Loading public files from: ${publicDir}`);
          await this.loadFilesFromDirectory(publicDir, "public", g.deploy.content.public);
          console.log(`[DEBUG] Loaded ${Object.keys(g.deploy.content.public).length} public files`);
        }

        // Load server files
        const serverDir = dir(`${extractDir}/server`);
        if (await existsAsync(serverDir)) {
          console.log(`[DEBUG] Loading server files from: ${serverDir}`);
          await this.loadFilesFromDirectory(serverDir, "server", g.deploy.content.code.server);
          console.log(`[DEBUG] Loaded ${Object.keys(g.deploy.content.code.server).length} server files`);
        }

        // Load site files
        const siteDir = dir(`${extractDir}/site`);
        if (await existsAsync(siteDir)) {
          console.log(`[DEBUG] Loading site files from: ${siteDir}`);
          await this.loadFilesFromDirectory(siteDir, "site", g.deploy.content.code.site);
          console.log(`[DEBUG] Loaded ${Object.keys(g.deploy.content.code.site).length} site files`);
        }

        // Load core files
        const coreDir = dir(`${extractDir}/core`);
        if (await existsAsync(coreDir)) {
          console.log(`[DEBUG] Loading core files from: ${coreDir}`);
          await this.loadFilesFromDirectory(coreDir, "core", g.deploy.content.code.core);
          console.log(`[DEBUG] Loaded ${Object.keys(g.deploy.content.code.core).length} core files`);
        }

        console.log(`[DEBUG] Successfully loaded ZIP deployment with metadata`);
      } else {
        // List available files in the ZIP
        console.log(`[DEBUG] Available files in ZIP:`);
        directory.files.forEach((file) => {
          console.log(`[DEBUG]  - ${file.path}`);
        });
        throw new Error("metadata.json not found in ZIP file");
      }

      // Clean up extracted directory
      console.log(`[DEBUG] Cleaning up extract directory...`);
      await removeAsync(extractDir);
      console.log(`[DEBUG] ZIP load completed successfully`);
    } catch (error) {
      console.error("[ERROR] Failed to load ZIP deployment:", error);
      console.error("[ERROR] Stack trace:", error.stack);
      throw error;
    }
  },
  async loadFilesFromDirectory(dirPath: string, prefix: string, target: Record<string, any>) {
    const files = await readdir(dirPath);

    for (const file of files) {
      const fullPath = dir(`${dirPath}/${file}`);
      const stat = await Bun.file(fullPath).stat();

      if (stat.isDirectory) {
        // Recursively load subdirectories
        await this.loadFilesFromDirectory(fullPath, `${prefix}/${file}`, target);
      } else {
        // Load file content
        const content = await Bun.file(fullPath).arrayBuffer();

        // Calculate relative path from the prefix
        const relativePath = file;

        // Determine if it's binary or text based on file extension
        const binaryExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.ico', '.svg', '.woff', '.woff2', '.ttf', '.eot', '.js', '.css', '.map'];
        const isBinary = binaryExtensions.some(ext => file.toLowerCase().endsWith(ext));

        // Build the full path relative to the target structure
        const targetPath = prefix === '' ? relativePath : `${prefix}/${relativePath}`;

        if (isBinary) {
          target[targetPath] = new Uint8Array(content);
        } else {
          target[targetPath] = new TextDecoder().decode(content);
        }
      }
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
