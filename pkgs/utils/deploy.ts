import {
  dirAsync,
  exists,
  existsAsync,
  read,
  removeAsync,
  writeAsync,
} from "fs-jetpack";
import unzipper from "unzipper";
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
      await this.run(load_from);
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

      // Initialize cache early to prevent undefined access errors
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

      if (g.deploy.content) {
        // Skip Brotli compression entirely to prevent blocking server startup
        console.log(`[DEBUG] Skipping Brotli compression to enable fast startup`);
        console.log(`[DEBUG] Brotli compression disabled - starting server immediately`);

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
      version: 2,
      timestamp: ts,
      site_id: this.config.site_id
    }, null, 2));
    this.config.deploy.ts = ts + "";

    await this.saveConfig();
  },
  async loadFromZip(ts: string) {
    try {
      console.log(`[DEBUG] Starting ZIP load for timestamp: ${ts}`);
      const zipPath = dir(`app/web/deploy/${ts}.zip`);

      if (!await exists(zipPath)) {
        throw new Error(`ZIP file not found: ${zipPath}`);
      }

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

      const zip = await unzipper.Open.file(zipPath);
      let foundMetadata = false;

      for (const entry of zip.files) {
        const entryName = entry.path;
        if (entry.type === "Directory" || entryName.endsWith("/")) continue;

        try {
          const fileContent: Buffer = await entry.buffer();

          if (entryName === "metadata.json") {
            const metadata = JSON.parse(fileContent.toString());
            this.detectMetadataInflation(metadata);
            g.deploy.content.layouts = metadata.layouts || [];
            g.deploy.content.pages = metadata.pages || [];
            g.deploy.content.comps = metadata.components || [];
            g.deploy.content.site = metadata.site;
            foundMetadata = true;
            console.log(`[DEBUG] Loaded metadata: ${metadata.layouts?.length || 0} layouts, ${metadata.pages?.length || 0} pages, ${metadata.components?.length || 0} components`);
          } else if (entryName.startsWith("public/")) {
            const rel = entryName.slice(7);
            const ext = rel.toLowerCase().split(".").pop() || "";
            const binary = ["jpg","jpeg","png","gif","ico","svg","woff","woff2","ttf","eot","js","css","map","webp","avif","otf"].includes(ext);
            g.deploy.content.public[rel] = binary ? new Uint8Array(fileContent) : fileContent.toString();
          } else if (entryName.startsWith("server/")) {
            const rel = entryName.slice(7);
            const ext = rel.toLowerCase().split(".").pop() || "";
            const binary = ["js","map","json"].includes(ext);
            g.deploy.content.code.server[rel] = binary ? new Uint8Array(fileContent) : fileContent.toString();
          } else if (entryName.startsWith("site/")) {
            const rel = entryName.slice(5);
            const ext = rel.toLowerCase().split(".").pop() || "";
            const binary = ["js","css","map","json","woff","woff2","ttf","webp","avif","otf"].includes(ext);
            g.deploy.content.code.site[rel] = binary ? new Uint8Array(fileContent) : fileContent.toString();
          } else if (entryName.startsWith("core/")) {
            const rel = entryName.slice(5);
            const ext = rel.toLowerCase().split(".").pop() || "";
            const binary = ["js","json","css","woff","woff2","ttf","webp","avif","otf","map"].includes(ext);
            g.deploy.content.code.core[rel] = binary ? new Uint8Array(fileContent) : fileContent.toString();
          } else if (entryName.startsWith("content/")) {
            if (!g.deploy.content._contentTrees) {
              g.deploy.content._contentTrees = {};
            }
            g.deploy.content._contentTrees[entryName] = fileContent.toString();
          }
        } catch (fileError: any) {
          console.warn(`[WARN] Failed to process ${entryName}:`, fileError.message);
        }
      }

      if (!foundMetadata) {
        throw new Error("metadata.json not found in ZIP file");
      }

      if (g.deploy.content._contentTrees && Object.keys(g.deploy.content._contentTrees).length > 0) {
        this.restoreContentTrees(g.deploy.content);
      }

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
  detectMetadataInflation(metadata: any) {
    console.log(`[INFLATION] Starting metadata inflation analysis...`);

    const analyzeItems = (items: any[], type: string) => {
      if (!items || !Array.isArray(items)) return [];

      const results = [];
      let totalSize = 0;

      for (const item of items) {
        const itemSize = JSON.stringify(item).length;
        totalSize += itemSize;

        // Check if this item has content_tree and calculate its size
        const contentTreeSize = item.content_tree ? JSON.stringify(item.content_tree).length : 0;

        if (itemSize > 100000 || contentTreeSize > 50000) { // 100KB total or 50KB content_tree
          results.push({
            id: item.id || 'unknown',
            name: item.name || 'unnamed',
            url: item.url || '',
            totalSize: itemSize,
            contentTreeSize: contentTreeSize,
            hasContentTree: !!item.content_tree,
            type: type
          });
        }
      }

      console.log(`[INFLATION] ${type}: ${items.length} items, total ${(totalSize / 1024 / 1024).toFixed(2)}MB`);
      return results;
    };

    // Analyze each type of content
    const inflatedLayouts = analyzeItems(metadata.layouts || [], 'layout');
    const inflatedPages = analyzeItems(metadata.pages || [], 'page');
    const inflatedComponents = analyzeItems(metadata.components || [], 'component');

    const allInflated = [...inflatedLayouts, ...inflatedPages, ...inflatedComponents];

    if (allInflated.length > 0) {
      console.log(`[INFLATION] ⚠️  Found ${allInflated.length} inflated items causing metadata bloat:`);

      // Sort by size (largest first)
      allInflated.sort((a, b) => b.totalSize - a.totalSize);

      // Show top 10 biggest offenders
      const topOffenders = allInflated.slice(0, 10);
      for (const item of topOffenders) {
        const sizeMB = (item.totalSize / 1024 / 1024).toFixed(2);
        const contentTreeMB = (item.contentTreeSize / 1024 / 1024).toFixed(2);
        const percentage = ((item.contentTreeSize / item.totalSize) * 100).toFixed(1);

        console.log(`[INFLATION]   📊 ${item.type.toUpperCase()}: ${item.name || item.id}`);
        console.log(`[INFLATION]      Size: ${sizeMB}MB total (${contentTreeMB}MB content_tree = ${percentage}%)`);
        if (item.url) console.log(`[INFLATION]      URL: ${item.url}`);
      }

      // Summary statistics
      const totalInflatedSize = allInflated.reduce((sum, item) => sum + item.totalSize, 0);
      const totalContentTreeSize = allInflated.reduce((sum, item) => sum + item.contentTreeSize, 0);

      console.log(`[INFLATION] 📈 Summary:`);
      console.log(`[INFLATION]   Total inflated items: ${allInflated.length}/${metadata.pages?.length + metadata.components?.length + metadata.layouts?.length || 0}`);
      console.log(`[INFLATION]   Total bloat: ${(totalInflatedSize / 1024 / 1024).toFixed(2)}MB`);
      console.log(`[INFLATION]   Content-tree bloat: ${(totalContentTreeSize / 1024 / 1024).toFixed(2)}MB (${((totalContentTreeSize / totalInflatedSize) * 100).toFixed(1)}%)`);

      if (metadata.optimization?.content_tree_removed) {
        console.log(`[INFLATION] ✅ Optimization already applied: content_tree removed from metadata`);
        console.log(`[INFLATION]    Original: ${metadata.optimization.original_pages || 0} pages, ${metadata.optimization.original_components || 0} components, ${metadata.optimization.original_layouts || 0} layouts`);
        console.log(`[INFLATION]    Reason: ${metadata.optimization.reason}`);
      } else {
        console.log(`[INFLATION] ❌ No optimization detected - consider applying content_tree separation`);
      }
    } else {
      console.log(`[INFLATION] ✅ No significant inflation detected`);
    }

    console.log(`[INFLATION] Analysis completed`);
  },

  restoreContentTrees(content: any) {
    if (!content._contentTrees) return;

    console.log(`[RESTORE] Restoring content_tree data from ${Object.keys(content._contentTrees).length} files...`);

    try {
      // Restore layout content trees
      if (content._contentTrees['content/layout-content-trees.json']) {
        const layoutTrees = JSON.parse(content._contentTrees['content/layout-content-trees.json']);
        let restoredLayouts = 0;
        for (const layout of content.layouts || []) {
          if (layoutTrees[layout.id]) {
            layout.content_tree = layoutTrees[layout.id];
            restoredLayouts++;
          }
        }
        console.log(`[RESTORE] ✓ Restored content_tree for ${restoredLayouts} layouts`);
      }

      // Restore page content trees
      if (content._contentTrees['content/page-content-trees.json']) {
        const pageTrees = JSON.parse(content._contentTrees['content/page-content-trees.json']);
        let restoredPages = 0;
        for (const page of content.pages || []) {
          if (pageTrees[page.id]) {
            page.content_tree = pageTrees[page.id];
            restoredPages++;
          }
        }
        console.log(`[RESTORE] ✓ Restored content_tree for ${restoredPages} pages`);
      }

      // Restore component content trees
      if (content._contentTrees['content/component-content-trees.json']) {
        const componentTrees = JSON.parse(content._contentTrees['content/component-content-trees.json']);
        let restoredComponents = 0;
        for (const component of content.comps || []) {
          if (componentTrees[component.id]) {
            component.content_tree = componentTrees[component.id];
            restoredComponents++;
          }
        }
        console.log(`[RESTORE] ✓ Restored content_tree for ${restoredComponents} components`);
      }

      // Clean up temporary storage
      delete content._contentTrees;

      console.log(`[RESTORE] ✅ Content tree restoration completed`);

    } catch (error) {
      console.error(`[RESTORE] ❌ Failed to restore content trees:`, error.message);
    }
  },

  has_gz() {
    if (this.config.deploy.ts) {
      const zipPath = dir(`app/web/deploy/${this.config.deploy.ts}.zip`);
      const gzPath = dir(`app/web/deploy/${this.config.deploy.ts}.gz`);

      if (Bun.file(zipPath).exists()) {
        // Verify the zip is for the correct site and uses current format
        const infoPath = dir(`app/web/deploy/${this.config.deploy.ts}.info`);
        try {
          const info = JSON.parse(Bun.file(infoPath).text());
          if (info.site_id === this.config.site_id && info.format === "zip" && info.version === 2) {
            return true;
          }
        } catch (e) {
          // Info file missing or invalid — treat as needs download
        }
      }

      if (Bun.file(gzPath).exists()) {
        return true;
      }
    }

    return false;
  },
};
