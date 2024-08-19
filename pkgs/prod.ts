import { $ } from "execa";
import exitHook from "exit-hook";
import { existsAsync } from "fs-jetpack";
import { dir } from "utils/dir";
import { g } from "utils/global";

g.main = {
  process: null,
  slave_process: null,
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

const startMain = (argv?: string) => {
  return Bun.spawn({
    cmd: ["bun", "run", "pkgs/index.ts", argv].filter((e) => e) as string[],
    cwd: process.cwd(),
    stdout: "inherit",
    stderr: "inherit",
    ipc(message, subprocess) {
      if (message === "restart") {
        setTimeout(() => {
          subprocess.send("kill");
        }, 1000);
        main.slave_process = startMain("skip_types");
      }
    },
    onExit(subprocess, exitCode, signalCode, error) {
      if (main.process === subprocess) {
        main.process = main.slave_process;
        main.slave_process = null;
      } else if (main.slave_process === subprocess) {
        console.error("Failed to start slave process");
      } else {
        main.restart.timeout = setTimeout(startMain, 500);
      }
    },
  });
};
main.process = startMain();
setTimeout(() => new Promise(() => 0), 0);
