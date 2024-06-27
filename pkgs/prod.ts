import { Subprocess } from "bun";
import { $ } from "execa";
import exitHook from "exit-hook";
import { existsAsync } from "fs-jetpack";
import { dir } from "utils/dir";
import { checkPort, randomBetween } from "utils/ensure";

let port = 0;

try {
  port = parseInt(await Bun.file(".pm_port").text());
} catch (e) {
  while (true) {
    port = randomBetween(5000, 15000);
    if (await checkPort(port)) {
      Bun.write(".pm_port", port.toString());
      break;
    }
  }
}

exitHook((signal) => {
  if (main.process && !main.process.killed) {
    main.process.kill();
  }
  console.log(`Exiting with signal: ${signal}`);
});

const main = {
  process: null as null | Subprocess,
  restart: {
    timeout: null as any,
  },
};

console.log("Process Manager running at port:", port);

if (process.env.DATABASE_URL) {
  if (!(await existsAsync(dir("node_modules/.prisma")))) {
    try {
      await $({ cwd: dir(`app/db`) })`bun install`;
      await $({  })`cp -f .env app/db`;
      await $({ cwd: dir(`app/db`) })`bun prisma db pull --force`;
      await $({ cwd: dir(`app/db`) })`bun prisma generate`;
    } catch (e) {
      console.error(e);
    }
  }
}

const startMain = () => {
  let mode = "started";
  if (main.process && !main.process.killed) return;
  if (main.process && main.process.killed) mode = "restarted";

  main.process = Bun.spawn({
    cmd: ["bun", "run", "pkgs/index.ts"],
    cwd: process.cwd(),
    stdout: "inherit",
    stderr: "inherit",
    onExit(subprocess, exitCode, signalCode, error) {
      clearTimeout(main.restart.timeout);
      main.restart.timeout = setTimeout(startMain, 500);
    },
  });
  console.log(`Main process`, mode, "pid:", main.process.pid);
};
startMain();
Bun.serve({
  port,
  async fetch(request, server) {
    if (main.process && !main.process.killed) {
      main.process.kill();
      await main.process.exited;
    }

    return new Response("OK");
  },
});
