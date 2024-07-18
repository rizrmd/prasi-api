import { BunSqliteKeyValue } from "bun-sqlite-key-value";
import { apiContext } from "service-srv";
import { dir } from "utils/dir";
import { g } from "utils/global";

export const _ = {
  url: "/_kv/**",
  raw: true,
  async api() {
    const { req } = apiContext(this);

    if (!g.kv) {
      g.kv = new BunSqliteKeyValue(dir(`${g.datadir}/db-kv.sqlite`));
    }

    try {
      const parts = req.params._.split("/");
      switch (parts[0]) {
        case "set": {
          const body = await req.json();
          if (typeof parts[1] === "string" && typeof body !== "undefined") {
            g.kv.set(parts[1], body);

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
          return new Response(JSON.stringify(g.kv.get(parts[1])), {
            headers: { "content-type": "application/json" },
          });
        }
      }
    } catch (e) {}

    return new Response(JSON.stringify({ status: "failed" }), {
      headers: { "content-type": "application/json" },
    });
  },
};
