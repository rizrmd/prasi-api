import { connect } from "bun";
import { g } from "./global";

export const ensureNotRunning = async () => {
  await new Promise<void>(async (resolve) => {
    if (!(await checkPort(g.port))) {
      g.log.warn(`Port ${g.port} is used, waiting...`);
      setInterval(async () => {
        if (await checkPort(g.port)) resolve();
      }, 500);
    } else {
      resolve();
    }
  });
};

export function randomBetween(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1) + min);
}

export const checkPort = (port: number) => {
  return new Promise<boolean>(async (done) => {
    try {
      const s = await connect({
        hostname: "0.0.0.0",
        port,
        socket: {
          open(socket) {},
          data(socket, data) {},
          close(socket) {},
          drain(socket) {},
          error(socket, error) {},
        },
      });
      s.end();
      done(false);
    } catch (e) {
      done(true);
    }
  });
};
