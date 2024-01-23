export const _file = {
  name: "_file",
  url: "/_file/**",
  path: "app/srv/api/_file.ts",
  args: [],
  handler: import("../../pkgs/api/_file")
}
export const _deploy = {
  name: "_deploy",
  url: "/_deploy",
  path: "app/srv/api/_deploy.ts",
  args: ["action"],
  handler: import("../../pkgs/api/_deploy")
}
export const _prasi = {
  name: "_prasi",
  url: "/_prasi/**",
  path: "app/srv/api/_prasi.ts",
  args: [],
  handler: import("../../pkgs/api/_prasi")
}
export const _notif = {
  name: "_notif",
  url: "/_notif/:action/:token",
  path: "app/srv/api/_notif.ts",
  args: ["action","data"],
  handler: import("../../pkgs/api/_notif")
}
export const _web = {
  name: "_web",
  url: "/_web/:id/**",
  path: "app/srv/api/_web.ts",
  args: ["id","_"],
  handler: import("../../pkgs/api/_web")
}
export const _proxy = {
  name: "_proxy",
  url: "/_proxy/*",
  path: "app/srv/api/_proxy.ts",
  args: ["arg"],
  handler: import("../../pkgs/api/_proxy")
}
export const _upload = {
  name: "_upload",
  url: "/_upload",
  path: "app/srv/api/_upload.ts",
  args: ["body"],
  handler: import("../../pkgs/api/_upload")
}
export const _dbs = {
  name: "_dbs",
  url: "/_dbs/:dbName/:action",
  path: "app/srv/api/_dbs.ts",
  args: ["dbName","action"],
  handler: import("../../pkgs/api/_dbs")
}
export const _api_frm = {
  name: "_api_frm",
  url: "/_api_frm",
  path: "app/srv/api/_api_frm.ts",
  args: [],
  handler: import("../../pkgs/api/_api_frm")
}