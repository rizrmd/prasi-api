import { $ } from "execa";
import * as fs from "fs";
import { dirAsync, removeAsync, writeAsync } from "fs-jetpack";
import { apiContext } from "service-srv";
import { deploy } from "utils/deploy";
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

    switch (action.type) {
      case "check":
        const deploys = fs.readdirSync(dir(`/app/web/deploy`));

        return {
          now: Date.now(),
          current: parseInt(g.deploy.config.deploy.ts),
          deploys: deploys.map((e) => parseInt(e.replace(".gz", ""))),
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

          try {
            await $({ cwd: dir("app/db") })`bun install`;
            await $({ cwd: dir("app/db") })`bun prisma db pull --force`;
            await $({ cwd: dir("app/db") })`bun prisma generate`;
          } catch (e) {
            console.error(e);
          }
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
          await removeAsync(dir(`/app/web/deploy/${action.ts}.gz`));
          const deploys = fs.readdirSync(dir(`/app/web/deploy`));

          return {
            now: Date.now(),
            current: parseInt(deploy.config.deploy.ts),
            deploys: deploys.map((e) => parseInt(e.replace(".gz", ""))),
          };
        }
        break;
      case "deploy-status":
        break;
      case "deploy":
        {
          deploy.config.site_id = action.id_site;

          await deploy.saveConfig();
          deploy.config.deploy.ts = Date.now() + "";
          await deploy.init();
          const deploys = fs.readdirSync(dir(`/app/web/deploy`));

          return {
            now: Date.now(),
            current: parseInt(deploy.config.deploy.ts),
            deploys: deploys.map((e) => parseInt(e.replace(".gz", ""))),
          };
        }
        break;
      case "redeploy":
        {
          deploy.config.deploy.ts = action.ts;
          await deploy.saveConfig();
          await deploy.load(action.ts);
          const deploys = fs.readdirSync(dir(`/app/web/deploy`));

          return {
            now: Date.now(),
            current: parseInt(deploy.config.deploy.ts),
            deploys: deploys.map((e) => parseInt(e.replace(".gz", ""))),
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
