import { file } from "bun";
import { $ } from "execa";
import {
  dirAsync,
  existsAsync,
  inspectTreeAsync,
  readAsync,
  removeAsync,
  writeAsync,
} from "fs-jetpack";
import { createRouter } from "radix3";
import { gunzipSync } from "zlib";
import { downloadFile } from "../api/_deploy";
import { dir } from "../utils/dir";
import { g } from "../utils/global";

export const loadWeb = async () => {
  g.web = {};

  await dirAsync(dir(`app/static`));
  const siteZip = `${
    g.mode === "dev" ? "http://localhost:4550" : "https://prasi.app"
  }/site-bundle`;
  const zipPath = dir(`app/static/site.zip`);
  const md5Path = dir(`app/static/md5`);

  if (!(await file(zipPath).exists()) || !(await file(md5Path).exists())) {
    const md5 = await fetch(`${siteZip}/md5`);
    await writeAsync(md5Path, await md5.text());
    await new Promise<void>((r) => setTimeout(r, 1000));
    await downloadFile(`${siteZip}/download`, zipPath);
    await removeAsync(dir(`app/static/site`));
    await $({ cwd: dir(`app/static`) })`unzip site.zip`;
  } else {
    const md5 = await fetch(`${siteZip}/md5`);
    const md5txt = await md5.text();

    if (md5txt !== (await readAsync(md5Path))) {
      const e = await fetch(`${siteZip}/download`);
      await removeAsync(dir(`app/static`));
      await dirAsync(dir(`app/static`));
      await downloadFile(`${siteZip}/download`, zipPath);
      await writeAsync(md5Path, md5txt);
      await $({ cwd: dir(`app/static`) })`unzip site.zip`;
    }
  }

  const list = await inspectTreeAsync(dir(`app/web`));
  for (const web of list?.children || []) {
    if (web.type === "file") continue;

    const deploy = web.children?.find((e) => e.name === "deploys");
    if (!deploy) {
      await dirAsync(dir(`app/web/${web.name}/deploys`));
    }

    g.web[web.name] = {
      current: parseInt(
        (await readAsync(dir(`app/web/${web.name}/current`))) || "0"
      ),
      deploys: deploy ? deploy.children.map((e) => parseInt(e.name)) : [],
      domains:
        (await readAsync(dir(`app/web/${web.name}/domains.json`), "json")) ||
        [],
      site_id: web.name,
      deploying: null,
      cacheKey: 0,
      router: null,
      cache: null,
    };

    const cur = g.web[web.name];

    if (!cur.deploys.includes(cur.current)) {
      cur.current = 0;
    }

    if (cur.current) {
      await loadWebCache(cur.site_id, cur.current);
    }
  }
};

const decoder = new TextDecoder();
export const loadWebCache = async (site_id: string, ts: number | string) => {
  const web = g.web[site_id];
  if (web) {
    const path = dir(`app/web/${site_id}/deploys/${ts}`);
    if (await existsAsync(path)) {
      const fileContent = await readAsync(path, "buffer");
      if (fileContent) {
        console.log(
          `Loading site ${site_id}: ${humanFileSize(fileContent.byteLength)}`
        );

        const res = gunzipSync(fileContent);
        web.cache = JSON.parse(decoder.decode(res));
        web.router = createRouter();
        for (const p of web.cache?.pages || []) {
          web.router.insert(p.url, p);
        }
      }
    }
  }
};

function humanFileSize(bytes: any, si = false, dp = 1) {
  const thresh = si ? 1000 : 1024;

  if (Math.abs(bytes) < thresh) {
    return bytes + " B";
  }

  const units = si
    ? ["kB", "MB", "GB", "TB", "PB", "EB", "ZB", "YB"]
    : ["KiB", "MiB", "GiB", "TiB", "PiB", "EiB", "ZiB", "YiB"];
  let u = -1;
  const r = 10 ** dp;

  do {
    bytes /= thresh;
    ++u;
  } while (
    Math.round(Math.abs(bytes) * r) / r >= thresh &&
    u < units.length - 1
  );

  return bytes.toFixed(dp) + " " + units[u];
}
