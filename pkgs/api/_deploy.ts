import { $ } from "execa";
import * as fs from "fs";
import { dirAsync, removeAsync, writeAsync } from "fs-jetpack";
import { apiContext } from "service-srv";
import { dir } from "utils/dir";
import { g } from "utils/global";
import { restartServer } from "utils/restart";

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

    const path = dir(`app/web/`);
    await dirAsync(path);

    const web = g.web;

    switch (action.type) {
      case "check":
        return {
          now: Date.now(),
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
          await writeAsync(
            dir("app/db/prisma/schema.prisma"),
            `\
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}`
          );
          await $({ cwd: dir("app/db") })`bun install`;
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
    g.log.info(`Downloading ${url} to ${filePath}`);
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
