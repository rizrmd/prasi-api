import { gunzipSync } from "bun";
import { unpack } from "msgpackr";
import { apiContext } from "service-srv";
import { execQuery } from "utils/query";

const g = global as any;
export const _ = {
  url: "/_dbs/*",
  raw: true,
  async api() {
    const ctx = apiContext(this);
    const { req, res } = ctx;
    if (typeof g.db !== "undefined") {
      if (req.params._ === "check") {
        return { mode: "encrypted" };
      }

      try {
        const body = unpack(gunzipSync(await req.arrayBuffer()));

        try {
          const result = await execQuery(body, g.db);
          return result;
        } catch (e: any) {
          console.log("_dbs error", body, e.message);
          res.sendStatus(500);
          res.send(e.message);
        }
      } catch (e) {
        res.sendStatus(500);
        res.send('{status: "unauthorized"}');
      }
    }
  },
};
