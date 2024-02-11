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
import { gunzipSync } from "zlib";
import { downloadFile } from "../api/_deploy";
import { dir } from "../utils/dir";
import { g } from "../utils/global";
const decoder = new TextDecoder();

export const loadWeb = async () => {
  await dirAsync(dir(`app/static`));
};

export const loadWebCache = async (site_id: string, ts: number | string) => {
  const web = g.web;
  if (web) {
    const path = dir(`app/web/deploys/${ts}`);
    if (await existsAsync(path)) {
      const fileContent = await readAsync(path, "buffer");
      if (fileContent) {
        console.log(
          `Loading site ${site_id}: ${humanFileSize(fileContent.byteLength)}`
        );

        const res = gunzipSync(fileContent);
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
