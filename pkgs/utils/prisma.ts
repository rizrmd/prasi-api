import { existsAsync } from "fs-jetpack";
import { dir } from "./dir";
import { $ } from "execa";
import { g } from "./global";
import { Prisma, PrismaClient } from "../../app/db/db";
import { execQuery } from "./query";

export const preparePrisma = async () => {
  if (process.env.DATABASE_URL && !g.db) {
    try {
      if (g.mode !== "dev") {
        await $({ cwd: dir(`app/db`) })`bun prisma generate`;
      }

      const { PrismaClient } = await import("../../app/db/db");
      g.db = new PrismaClient();
      (g.db as any)._batch = {
        upsert: (async (arg) => {
          return execQuery(
            {
              action: "batch_upsert",
              params: { arg } as any,
              db: "",
              table: arg.table,
            },
            g.db
          );
        }) as Upsert,
      };
    } catch (e) {
      console.error("Failed to initialize Prisma:", e);
      g.db = null;
    }
  }

  g.dburl = process.env.DATABASE_URL || "";
};

type Upsert = <T extends Prisma.ModelName>(arg: {
  table: T;
  where: Exclude<
    Parameters<PrismaClient[T]["findMany"]>[0],
    undefined
  >["where"];
  data: Exclude<Parameters<PrismaClient[T]["create"]>[0], undefined>["data"][];
  mode?: "field" | "relation";
}) => Promise<void>;
