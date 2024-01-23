import { $ } from "execa";
import * as fs from "fs";
import { dirAsync, removeAsync } from "fs-jetpack";
import { apiContext } from "service-srv";
import { dir } from "utils/dir";
import { g } from "utils/global";
import { restartServer } from "utils/restart";
import { loadWebCache } from "../server/load-web";
export const _ = {
  url: "/_deploy",
  async api(
    action: (
      | { type: "check" }
      | { type: "db-update"; url: string }
      | { type: "db-pull" }
      | { type: "restart" }
      | { type: "domain-add"; domain: string }
      | { type: "domain-del"; domain: string }
      | { type: "deploy-del"; ts: string }
      | { type: "deploy"; dlurl: string }
      | { type: "deploy-status" }
      | { type: "redeploy"; ts: string }
    ) & {
      id_site: string;
    }
  ) {
    const { res } = apiContext(this);

    if (!g.web[action.id_site]) {
      g.web[action.id_site] = {
        current: 0,
        domains: [],
        deploying: null,
        router: null,
        deploys: [],
        site_id: action.id_site,
        cacheKey: 0,
        cache: null,
      };
    }
    const path = dir(`app/web/${action.id_site}`);
    await dirAsync(path);

    const web = g.web[action.id_site];

    if (!web.domains) {
      web.domains = [];
    }

    switch (action.type) {
      case "check":
        return {
          now: Date.now(),
          current: web.current,
          deploys: web.deploys,
          domains: web.domains,
          db: {
            url: g.dburl || "-",
          },
        };
      case "db-update":
        if (action.url) {
          g.dburl = action.url;
          await Bun.write(
            dir("app/db/.env"),
            `\
DATABASE_URL="${action.url}"
`
          );
        }
        return "ok";
      case "db-pull":
        {
          await $({ cwd: dir("app/db") })`bun prisma db pull`;
          await $({ cwd: dir("app/db") })`bun prisma generate`;
          res.send("ok");
          setTimeout(() => {
            restartServer();
          }, 300);
        }
        break;
      case "restart":
        {
          res.send("ok");
          setTimeout(() => {
            restartServer();
          }, 300);
        }
        break;
      case "domain-add":
        {
          web.domains.push(action.domain);
          await Bun.write(`${path}/domains.json`, JSON.stringify(web.domains));
          g.domains = null;
          res.send("ok");
        }
        break;
      case "domain-del":
        {
          web.domains = web.domains.filter((e) => e !== action.domain);
          await Bun.write(`${path}/domains.json`, web.domains);
          g.domains = null;

          res.send("ok");
        }
        break;
      case "deploy-del":
        {
          web.deploys = web.deploys.filter((e) => e !== parseInt(action.ts));
          try {
            await removeAsync(`${path}/deploys/${action.ts}`);
          } catch (e) {}
          return {
            now: Date.now(),
            current: web.current,
            deploys: web.deploys,
          };
        }
        break;
      case "deploy-status":
        break;
      case "deploy":
        {
          await fs.promises.mkdir(`${path}/deploys`, { recursive: true });
          const cur = Date.now();
          const filePath = `${path}/deploys/${cur}`;
          web.deploying = {
            status: "generating",
            received: 0,
            total: 0,
          };
          if (
            await downloadFile(action.dlurl, filePath, (rec, total) => {
              web.deploying = {
                status: "transfering",
                received: rec,
                total: total,
              };
            })
          ) {
            web.deploying.status = "deploying";
            await fs.promises.writeFile(`${path}/current`, cur.toString());
            web.current = cur;
            web.deploys.push(cur);
            await loadWebCache(web.site_id, web.current);
          }
          web.deploying = null;

          return {
            now: Date.now(),
            current: web.current,
            deploys: web.deploys,
          };
        }
        break;
      case "redeploy":
        {
          const cur = parseInt(action.ts);
          const lastcur = web.current;
          try {
            if (web.deploys.find((e) => e === cur)) {
              web.current = cur;
              await fs.promises.writeFile(`${path}/current`, cur.toString());
              await loadWebCache(web.site_id, web.current);
            }
          } catch (e) {
            web.current = lastcur;
            web.deploys = web.deploys.filter((e) => e !== parseInt(action.ts));
            await removeAsync(`${path}/deploys/${action.ts}`);
          }

          return {
            now: Date.now(),
            current: web.current,
            deploys: web.deploys,
          };
        }
        break;
    }
  },
};

export const downloadFile = async (
  url: string,
  filePath: string,
  progress?: (rec: number, total: number) => void
) => {
  try {
    const _url = new URL(url);
    if (_url.hostname === "localhost") {
      _url.hostname = "127.0.0.1";
    }
    const res = await fetch(_url);
    if (res.body) {
      const file = Bun.file(filePath);

      const writer = file.writer();
      const reader = res.body.getReader();

      // Step 3: read the data
      let receivedLength = 0; // received that many bytes at the moment
      let chunks = []; // array of received binary chunks (comprises the body)
      while (true) {
        const { done, value } = await reader.read();

        if (done) {
          writer.end();
          break;
        }

        chunks.push(value);
        writer.write(value);
        receivedLength += value.length;

        if (progress) {
          progress(
            receivedLength,
            parseInt(res.headers.get("content-length") || "0")
          );
        }
      }
    }
    return true;
  } catch (e) {
    console.log(e);
    return false;
  }
};
