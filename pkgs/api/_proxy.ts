import { apiContext } from "service-srv";

export const _ = {
  url: "/_proxy/**",
  raw: true,
  async api() {
    const { req } = apiContext(this);

    try {
      const raw_url = decodeURIComponent(req.params["_"]);
      const url = new URL(raw_url) as URL;
      const body = await req.arrayBuffer();
      const headers = {} as Record<string, string>;
      req.headers.forEach((v, k) => {
        if (k.startsWith("sec-")) return;
        if (k.startsWith("connection")) return;
        if (k.startsWith("dnt")) return;
        if (k.startsWith("host")) return;
        headers[k] = v;
      });

      const res = await fetch(url, {
        method: req.method || "POST",
        headers,
        body,
      });

      if (res.headers.get("content-encoding")) {
        res.headers.delete("content-encoding");
      }

      return res;
    } catch (e: any) {
      console.error(e);
      new Response(
        JSON.stringify({
          status: "failed",
          reason: e.message,
        }),
        {
          status: 403,
          headers: { "content-type": "application/json" },
        }
      );
    }
  },
};
