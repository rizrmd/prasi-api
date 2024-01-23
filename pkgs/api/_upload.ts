import mp from "@surfy/multipart-parser";
import { writeAsync } from "fs-jetpack";
import { apiContext } from "service-srv";
import { dir } from "utils/dir";
import { g } from "utils/global";
export const _ = {
  url: "/_upload",
  async api(body: any) {
    const { req } = apiContext(this);
    let url = "";

    const raw = await req.arrayBuffer();
    const parts = mp(Buffer.from(raw)) as Record<
      string,
      { fileName: string; mime: string; type: string; buffer: Buffer }
    >;

    for (const [_, part] of Object.entries(parts)) {
      const d = new Date();
      const path = `${d.getFullYear()}-${d.getMonth()}/${d.getDate()}/${d.getTime()}-${part.fileName
        ?.replace(/[\W_]+/g, "-")
        .toLowerCase()}`;

      url = `/_file/${path}`;
      await writeAsync(dir(`${g.datadir}/upload/${path}`), part.buffer);
    }

    return url;
  },
};
function toArrayBuffer(buffer: Buffer) {
  return buffer.buffer.slice(
    buffer.byteOffset,
    buffer.byteOffset + buffer.byteLength
  );
}
