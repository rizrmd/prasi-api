import { $ } from "execa";
import fs from "fs";
import {
  copyAsync,
  dirAsync,
  existsAsync,
  removeAsync
} from "fs-jetpack";
import path from "path";

const dir = {
  path(...allpath: any[]) {
    return path.join(process.cwd(), ...allpath);
  },
  read(dirPath: string, baseDir?: string[]): Record<string, string> {
    const result: Record<string, string> = {};

    const contents = fs.readdirSync(dirPath);

    for (const item of contents) {
      const itemPath = path.join(dirPath, item);
      const stats = fs.statSync(itemPath);

      if (stats.isFile()) {
        // const content = fs.readFileSync(itemPath, "utf-8");
        result[[...(baseDir || []), item].join("/")] = "";
      } else if (stats.isDirectory()) {
        if (item !== "node_modules" && item !== ".git") {
          const subdirResult = dir.read(itemPath, [...(baseDir || []), item]);
          Object.assign(result, subdirResult);
        }
      }
    }

    return result;
  },
};

if (!(await existsAsync(dir.path("_tmp_docker")))) {
  for (const file of Object.keys(dir.read(dir.path``))) {
    if (file.endsWith("package.json")) {
      await dirAsync(dir.path("_tmp_docker", path.dirname(file)));
      await copyAsync(dir.path(file), dir.path("_tmp_docker", file), {
        overwrite: true,
      });
    }
  }
  await copyAsync(dir.path("bun.lockb"), dir.path("_tmp_docker", "bun.lockb"));

  await $({ cwd: dir.path("_tmp_docker") })`zip -r ../docker .`;
  await $`mv docker.zip dockerzip`;
  await removeAsync(dir.path("_tmp_docker"));
}
