import { $ } from "execa";
import { g } from "./global";

export const restartServer = () => {
  if (g.mode === "dev") {
    $`bun ${g.mode}`;
  } else {
    process?.send?.("restart");
  }
};
