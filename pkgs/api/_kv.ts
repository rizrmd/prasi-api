import { BunSqliteKeyValue } from "../utils/kv";
import { apiContext } from "service-srv";
import { dir } from "../utils/dir";
import { g } from "../utils/global";

export const _ = {
  url: "/_kv",
  raw: true,
  async api(mode: "get" | "set" | "del", key: string, value?: any) {
    const { req } = apiContext(this);

    if (!g.kv) {
      g.kv = new BunSqliteKeyValue(dir(`${g.datadir}/db-kv.sqlite`));
    }

    try {
      const parts = (await req.json()) as [string, string, any];
      switch (parts[0]) {
        case "set": {
          if (typeof parts[1] === "string") {
            g.kv.set(parts[1], parts[2]);

            return new Response(JSON.stringify({ status: "ok" }), {
              headers: { "content-type": "application/json" },
            });
          }

          return new Response(
            JSON.stringify({ status: "failed", reason: "no key or body" }),
            {
              headers: { "content-type": "application/json" },
            }
          );
        }
        case "get": {
          if (parts[2]) {
            g.kv.set(parts[1], parts[2]);
          }

          return new Response(JSON.stringify(g.kv.get(parts[1]) || null), {
            headers: { "content-type": "application/json" },
          });
        }
        case "del": {
          if (parts[1]) {
            g.kv.delete(parts[1]);

            return new Response(JSON.stringify({ status: "ok" }), {
              headers: { "content-type": "application/json" },
            });
          }
        }
      }
    } catch (e) {}

    return new Response(JSON.stringify({ status: "failed" }), {
      headers: { "content-type": "application/json" },
    });
  },
};
