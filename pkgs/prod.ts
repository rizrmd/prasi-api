import { $ } from "execa";
import exitHook from "exit-hook";
import { existsAsync } from "fs-jetpack";
import { dir } from "utils/dir";
import { g } from "utils/global";

g.main = {
  process: null,
  restart: {
    timeout: null as any,
  },
};
const main = g.main;

exitHook((signal) => {
  if (main.process) {
    main.process.kill();
  }
  console.log(`Exiting with signal: ${signal}`);
});

if (process.env.DATABASE_URL) {
  if (
    !(await existsAsync(dir("node_modules/.prisma"))) &&
    process.env.DATABASE_URL
  ) {
    try {
      await Bun.write(
        dir("app/db/.env"),
        `DATABASE_URL=${process.env.DATABASE_URL}`
      );
      await $({ cwd: dir(`app/db`) })`bun install`;
      await $({ cwd: dir(`app/db`) })`bun prisma db pull --force`;
      await $({ cwd: dir(`app/db`) })`bun prisma generate`;
    } catch (e) {
      console.error(e);
    }
  }
}

const startMain = () => {
  return Bun.spawn({
    cmd: ["bun", "run", "pkgs/index.ts"],
    cwd: process.cwd(),
    stdout: "inherit",
    stderr: "inherit",
    ipc(message, subprocess) {
      if (message === "restart") {
        setTimeout(() => {
          subprocess.kill();
        }, 5000);
        main.process = startMain();
      }
    },
    onExit(subprocess, exitCode, signalCode, error) {
      clearTimeout(main.restart.timeout);
      main.restart.timeout = setTimeout(startMain, 500);
    },
  });
};
main.process = startMain();
setTimeout(() => new Promise(() => 0), 0);
