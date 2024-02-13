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
  deploy: {
    init: boolean;
    raw: any;
    router: RadixRouter<{ url: string; id: string }>;
    layout: null | any;
    comps: Record<string, any>;
    gz: null | {
      layouts: {
        id: string;
        url: string;
        name: true;
        content_tree: any;
        is_default_layout: true;
      }[];
      pages: { id: string; url: string; name: true; content_tree: any }[];
      site: {};
      comps: { id: string; content_tree: true }[];
      code: {
        server: Record<string, string>;
        site: Record<string, string>;
        core: Record<string, string>;
      };
    };
    config: {
      site_id: string;
      deploy: { ts: string };
    };
  };
};
