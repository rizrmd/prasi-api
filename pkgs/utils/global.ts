import { Server, WebSocketHandler } from "bun";
import { Logger } from "pino";
import { RadixRouter } from "radix3";
import { PrismaClient } from "../../app/db/db";

import admin from "firebase-admin";
import { Database } from "bun:sqlite";
import { prodIndex } from "./prod-index";
import { BunSqliteKeyValue } from "bun-sqlite-key-value";

type SingleRoute = {
  url: string;
  args: string[];
  raw: boolean;
  fn: (...arg: any[]) => Promise<any>;
  path: string;
};

export type SinglePage = {
  id: string;
  url: string;
  name: true;
  content_tree: any;
  is_default_layout: true;
};

type PrasiServer = {
  ws?: WebSocketHandler<{ url: string }>;
  http: (arg: {
    url: { raw: URL; pathname: string };
    req: Request;
    server: Server;
    mode: "dev" | "prod";
    handle: (req: Request) => Promise<Response>;
    index: { head: string[]; body: string[]; render: () => string };
    prasi: { page_id?: string };
  }) => Promise<Response>;
  init?: (arg: { port: number }) => Promise<void>;
};

export const g = global as unknown as {
  db: PrismaClient;
  kv: BunSqliteKeyValue;
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
  compress: {
    mode: "all" | "only-gz" | "off";
  };
  api: Record<string, SingleRoute>;
  api_gen: {
    "load.json": string;
    "load.js.dev": string;
    "load.js.prod": string;
  };
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
  cache: {
    br: Record<string, Uint8Array>;
    br_progress: {
      pending: Record<string, any>;
      running: boolean;
      timeout: any;
    };
    gz: Record<string, Uint8Array>;
  };
  createServer: (
    arg: PrasiServer & { api: any; db: any }
  ) => (site_id: string) => Promise<PrasiServer & { api: any; db: any }>;
  deploy: {
    init: boolean;
    raw: any;
    router?: RadixRouter<{ url: string; id: string }>;
    layout: null | any;
    comps: Record<string, any>;
    pages: Record<
      string,
      { id: string; url: string; name: true; content_tree: any }
    >;
    content: null | {
      layouts: SinglePage[];
      pages: SinglePage[];
      site: any;
      comps: { id: string; content_tree: true }[];
      public: Record<string, any>;
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
    server: PrasiServer | null;
  };
};
