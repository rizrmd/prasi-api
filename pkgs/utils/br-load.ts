import brotliPromise from "brotli-wasm"; // Import the default export
import { g } from "./global";
import { dir } from "./dir";

const encoder = new TextEncoder();
const brotli = await brotliPromise;
export const loadCachedBr = (hash: string, content: string) => {
  if (!g.cache.br[hash]) {
    if (!g.cache.br_progress.pending[hash]) {
      g.cache.br_progress.pending[hash] = content;
      recurseCompressBr();
    }
  }
};

const recurseCompressBr = () => {
  clearTimeout(g.cache.br_progress.timeout);
  g.cache.br_progress.timeout = setTimeout(async () => {
    if (g.cache.br_progress.running) {
      return;
    }

    g.cache.br_progress.running = true;
    const entries = Object.entries(g.cache.br_progress.pending);
    if (entries.length > 0) {
      const [hash, content] = entries.shift() as [string, string | Uint8Array];

      const file = Bun.file(dir(`${g.datadir}/br-cache/${hash}`));
      if (await file.exists()) {
        g.cache.br[hash] = new Uint8Array(await file.arrayBuffer());
      } else {
        g.cache.br[hash] = brotli.compress(
          typeof content === "string" ? encoder.encode(content) : content,
          { quality: 11 }
        );
        await Bun.write(file, g.cache.br[hash]);
      }
      delete g.cache.br_progress.pending[hash];
      g.cache.br_progress.running = false;
      recurseCompressBr();
    } else {
      console.log("brotli cache finished");
    }
  }, 50);
};
