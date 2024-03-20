import { existsAsync } from "fs-jetpack";
import { dir } from "./dir";
import { $ } from "execa";
import { g } from "./global";

export const preparePrisma = async () => {
  if ((await existsAsync(dir("app/db/.env"))) && !g.db) {
    try {
      if (g.mode !== "dev") {
        await $({ cwd: dir(`app/db`) })`bun prisma db pull`;
        await $({ cwd: dir(`app/db`) })`bun prisma generate`;
      }
      
      const { PrismaClient } = await import("../../app/db/db");
      g.db = new PrismaClient();
    } catch (e) {
      console.log("Prisma not initialized", e);
    }
  }

  g.dburl = process.env.DATABASE_URL || "";
};
