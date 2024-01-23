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
  firebaseInit: boolean,
  firebase: admin.app.App;
  notif: {
    db: Database;
  };
  api: Record<string, SingleRoute>;
  domains: null | Record<string, string>;
  web: Record<
    string,
    {
      site_id: string;
      current: number;
      deploying: null | { status: string; received: number; total: number };
      deploys: number[];
      domains: string[];
      router: null | RadixRouter<{ id: string }>;
      cacheKey: number;
      cache: null | {
        site: {
          id: string;
          name: string;
          favicon: string;
          domain: string;
          id_user: string;
          created_at: Date | null;
          id_org: string | null;
          updated_at: Date | null;
          responsive: string;
        } | null;
        pages: {
          id: string;
          name: string;
          url: string;
          content_tree: any;
          id_site: string;
          created_at: Date | null;
          js_compiled: string | null;
          js: string | null;
          updated_at: Date | null;
          id_folder: string | null;
          is_deleted: boolean;
        }[];
        npm: {
          site: Record<string, string>;
          pages: Record<string, Record<string, string>>;
        };
        comps: {
          id: string;
          name: string;
          content_tree: any;
          created_at: Date | null;
          updated_at: Date | null;
          type: string;
          id_component_group: string | null;
          props: any;
        }[];
      };
    }
  >;
  router: RadixRouter<SingleRoute>;
  port: number;
  frm: {
    js: string;
    etag: string;
  };
};
