declare module "app/db/db" {
    
}
declare module "pkgs/utils/global" {
    import { Logger } from "pino";
    import { RadixRouter } from "radix3";
    
    import { Database } from "bun:sqlite";
    type SingleRoute = {
        url: string;
        args: string[];
        fn: (...arg: any[]) => Promise<any>;
        path: string;
    };
    export const g: {
        
        dburl: string;
        datadir: string;
        mode: "dev" | "prod";
        
        log: Logger;
        firebaseInit: boolean;
        firebase: admin.app.App;
        notif: {
            db: Database;
        };
        api: Record<string, SingleRoute>;
        domains: null | Record<string, string>;
        web: Record<string, {
            site_id: string;
            current: number;
            deploying: null | {
                status: string;
                received: number;
                total: number;
            };
            deploys: number[];
            domains: string[];
            router: null | RadixRouter<{
                id: string;
            }>;
            cacheKey: number;
            cache: null | {
                site: {
                    id: string;
                    name: string;
                    favicon: string;
                    domain: string;
                    id_user: string;
                    created_at: Date | null;
                    id_org: string | null;
                    updated_at: Date | null;
                    responsive: string;
                } | null;
                pages: {
                    id: string;
                    name: string;
                    url: string;
                    content_tree: any;
                    id_site: string;
                    created_at: Date | null;
                    js_compiled: string | null;
                    js: string | null;
                    updated_at: Date | null;
                    id_folder: string | null;
                    is_deleted: boolean;
                }[];
                npm: {
                    site: Record<string, string>;
                    pages: Record<string, Record<string, string>>;
                };
                comps: {
                    id: string;
                    name: string;
                    content_tree: any;
                    created_at: Date | null;
                    updated_at: Date | null;
                    type: string;
                    id_component_group: string | null;
                    props: any;
                }[];
            };
        }>;
        router: RadixRouter<SingleRoute>;
        port: number;
        frm: {
            js: string;
            etag: string;
        };
    };
}
declare module "pkgs/server/serve-web" {
    export const serveWeb: (url: URL, req: Request) => Promise<false | string[] | Response>;
    export const generateIndexHtml: (base_url: string, site_id: string) => string;
}
declare module "pkgs/api/_file" {
    export const _: {
        url: string;
        api(): Promise<Response>;
    };
}
declare module "pkgs/utils/dir" {
    export const dir: (path: string) => string;
}
declare module "pkgs/server/load-web" {
    export const loadWeb: () => Promise<void>;
    export const loadWebCache: (site_id: string, ts: number | string) => Promise<void>;
}
declare module "pkgs/api/_deploy" {
    export const _: {
        url: string;
        api(action: ({
            type: "check";
        } | {
            type: "db-update";
            url: string;
        } | {
            type: "db-pull";
        } | {
            type: "restart";
        } | {
            type: "domain-add";
            domain: string;
        } | {
            type: "domain-del";
            domain: string;
        } | {
            type: "deploy-del";
            ts: string;
        } | {
            type: "deploy";
            dlurl: string;
        } | {
            type: "deploy-status";
        } | {
            type: "redeploy";
            ts: string;
        }) & {
            id_site: string;
        }): Promise<"ok" | {
            now: number;
            current: any;
            deploys: any;
            domains: any;
            db: {
                url: any;
            };
        } | {
            now: number;
            current: any;
            deploys: any;
            domains?: undefined;
            db?: undefined;
        }>;
    };
    export const downloadFile: (url: string, filePath: string, progress?: (rec: number, total: number) => void) => Promise<boolean>;
}
declare module "pkgs/api/_prasi" {
    export const _: {
        url: string;
        api(): Promise<void>;
    };
    export const getApiEntry: () => any;
}
declare module "pkgs/api/_notif" {
    export const _: {
        url: string;
        api(action: string, data: {
            type: "register";
            token: string;
            id: string;
        } | {
            type: "send";
            id: string;
            body: string;
            title: string;
            data?: any;
        }): Promise<{
            result: string;
            error?: undefined;
            totalDevice?: undefined;
        } | {
            error: string;
            result?: undefined;
            totalDevice?: undefined;
        } | {
            result: string;
            totalDevice: any;
            error?: undefined;
        }>;
    };
}
declare module "pkgs/api/_web" {
    export const _: {
        url: string;
        api(id: string, _: string): Promise<any>;
    };
}
declare module "pkgs/api/_proxy" {
    export const _: {
        url: string;
        api(arg: {
            url: string;
            method: "POST" | "GET";
            headers: any;
            body: any;
        }): Promise<Response>;
    };
}
declare module "pkgs/api/_upload" {
    export const _: {
        url: string;
        api(body: any): Promise<string>;
    };
}
declare module "pkgs/api/_dbs" {
    export const _: {
        url: string;
        api(dbName: any, action?: string): Promise<void>;
    };
}
declare module "pkgs/api/_api_frm" {
    export const _: {
        url: string;
        api(): Promise<void>;
    };
}
declare module "app/srv/exports" {
    export const _file: {
        name: string;
        url: string;
        path: string;
        args: any[];
        handler: Promise<typeof import("pkgs/api/_file")>;
    };
    export const _deploy: {
        name: string;
        url: string;
        path: string;
        args: string[];
        handler: Promise<typeof import("pkgs/api/_deploy")>;
    };
    export const _prasi: {
        name: string;
        url: string;
        path: string;
        args: any[];
        handler: Promise<typeof import("pkgs/api/_prasi")>;
    };
    export const _notif: {
        name: string;
        url: string;
        path: string;
        args: string[];
        handler: Promise<typeof import("pkgs/api/_notif")>;
    };
    export const _web: {
        name: string;
        url: string;
        path: string;
        args: string[];
        handler: Promise<typeof import("pkgs/api/_web")>;
    };
    export const _proxy: {
        name: string;
        url: string;
        path: string;
        args: string[];
        handler: Promise<typeof import("pkgs/api/_proxy")>;
    };
    export const _upload: {
        name: string;
        url: string;
        path: string;
        args: string[];
        handler: Promise<typeof import("pkgs/api/_upload")>;
    };
    export const _dbs: {
        name: string;
        url: string;
        path: string;
        args: string[];
        handler: Promise<typeof import("pkgs/api/_dbs")>;
    };
    export const _api_frm: {
        name: string;
        url: string;
        path: string;
        args: any[];
        handler: Promise<typeof import("pkgs/api/_api_frm")>;
    };
}
