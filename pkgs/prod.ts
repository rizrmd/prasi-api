import { $ } from "execa";
import exitHook from "exit-hook";
import { existsAsync } from "fs-jetpack";
import { dir } from "utils/dir";
import { g } from "utils/global";

g.main = {
  process: null as null | Worker,
  restart: {
    timeout: null as any,
  },
};
const main = g.main;

exitHook((signal) => {
  if (main.process) {
    main.process.terminate();
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
        `DATABASE_URL=${process.env.DATABASE_URL}`,
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
  let mode = "started";

  const worker = new Worker("pkgs/index.ts");
  worker.onmessage = (event) => {
    if (event.data === "restart") {
      const oldprocess = main.process;
      setTimeout(() => {
        oldprocess?.postMessage("stop-server");
      }, 1000);
      main.process = startMain();
    }
  };
  worker.addEventListener("close", (event) => {
    console.log("Main worker being closed, thread-id: " + worker.threadId);
  });
  console.log(`Main worker`, mode, "thread-id:", worker.threadId);
  return worker;
};
main.process = startMain();
setTimeout(() => new Promise(() => 0), 0);