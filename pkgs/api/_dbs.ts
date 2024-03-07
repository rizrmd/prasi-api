import { apiContext } from "service-srv";
import { execQuery } from "utils/query";

const g = global as any;
export const _ = {
  url: "/_dbs/:tableName",
  async api(tableName: any) {
    const { req, res } = apiContext(this);
    if (typeof g.db !== "undefined") {
      const body = req.params;

      try {
        const result = await execQuery(body, g.db);
        res.send(result);
      } catch (e: any) {
        res.sendStatus(500);
        res.send(e.message);
        console.error(e);
      }
    }
  },
};
