import { Server } from "bun";
import { Logger } from "pino";
import { RadixRouter } from "radix3";
import { PrismaClient } from "../../app/db/db";

import admin from "firebase-admin";
import { Database } from "bun:sqlite";

type SingleRoute = {
  url: string;
  args: string[];
  fn: (...arg: any[]) => Promise<any>;
  path: string;
};

export const g = global as unknown as {
  db: PrismaClient;
  dburl: string;
  datadir: string;
  mode: "dev" | "prod";
  server: Server;
  log: Logger;
  firebaseInit: boolean;
  firebase: admin.app.App;
  notif: {
    db: Database;
  };
  api: Record<string, SingleRoute>;
  web: {
    site_id: string;
    current: number;
    deploying: null | { status: string; received: number; total: number };
    deploys: number[];
    router: RadixRouter<SingleRoute>;
  };
  router: RadixRouter<SingleRoute>;
  port: number;
  frm: {
    js: string;
    etag: string;
  };
};
