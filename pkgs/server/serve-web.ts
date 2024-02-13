import { statSync } from "fs";
import { join } from "path";
import { dir } from "utils/dir";

export const serveWeb = async (url: URL, req: Request) => {
  return {};
};

export const generateIndexHtml = (base_url: string, site_id: string) => {
  const base = base_url.endsWith("/")
    ? base_url.substring(0, base_url.length - 1)
    : base_url;

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title></title>
  <link rel="stylesheet" href="${base}/index.css?fresh">
</head>
<body class="flex-col flex-1 w-full min-h-screen flex opacity-0">
  <div style="position:absolute;opacity:0.1;top:0;left:0">&nbsp;</div>
  <div id="root"></div>
  <script src="${base}/site.js" type="module"></script>
  <script>window.id_site = "${site_id}";</script>
</body>
</html>`;
};
