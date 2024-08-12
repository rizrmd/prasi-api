import { Property, createPrismaSchemaBuilder } from "@mrleebo/prisma-ast";
import { readAsync } from "fs-jetpack";
import { createRelMany } from "./db/create-rel-many";
import { HasManyType, HasOneType } from "./db/types";
import { dir } from "./dir";
import { gunzipAsync } from "./gzip";

export type DBArg = {
  db: string;
  table: string;
  action: string;
  params: any[];
};

export const execQuery = async (args: DBArg, prisma: any) => {
  const { table, action, params } = args;

  if (action === "batch_upsert") {
    const { arg } = params as unknown as {
      arg?: {
        table: string;
        where: any;
        data: any[];
        mode: "field" | "raw";
      };
    };
    if (arg) {
      const { table, where, data } = arg;
      const mode = arg.mode || "field";
      if (table && where && data) {
        const transactions = [];

        const schema_path = dir("app/db/prisma/schema.prisma");
        const schema = createPrismaSchemaBuilder(await readAsync(schema_path));
        const schema_table = schema.findByType("model", { name: table });
        const tables = schema
          .findAllByType("model", {})
          .map((e) => e?.name) as string[];

        if (schema_table) {
          let pks: Property[] = [];
          let pk_composite_rel = "";
          for (const col of schema_table.properties) {
            if (col.type === "field" && !col.array) {
              if (col.attributes && col.attributes?.length > 0) {
                const is_pk = col.attributes.find((e) => e.name === "id");
                if (is_pk) {
                  pks.push(col);
                  break;
                }
              }
            }
            if (
              col.type === "attribute" &&
              col.name === "id" &&
              col.kind === "object"
            ) {
              const value = col.args[0].value as any;
              if (Array.isArray(value.args) && value.args.length > 0) {
                pks = value.args.map((e: string) => ({
                  name: e,
                }));
              }
            }
          }

          const rels = getRels({ schema_table, schema, table, tables });
          if (pks.length > 0) {
            if (pks.length > 1) {
              pk_composite_rel = pks.map((e) => e.name).join("_");
            }

            if (Object.keys(where.length > 0)) {
              const rel_many = {} as Record<
                string,
                {
                  to: string;
                  from: string;
                  pk: string[];
                  select: Set<string>;
                  ops: Map<
                    any,
                    {
                      delete: Set<any>;
                      insert: Set<any>;
                      tobe: any[];
                    }
                  >;
                }
              >;
              
              if (mode !== "raw") {
                for (const row of data) {
                  for (const [k, v] of Object.entries(row) as any) {
                    const rel = rels[k];
                    if (rel) {
                      if (rel.type === "has-one") {
                        const to = rel.to.fields[0];
                        if (!v.connect && v[to]) {
                          let newv = { connect: { [to]: v[to] } };
                          row[k] = newv;
                        }
                      } else if (rel.type === "has-many") {
                        if (!rel_many[k]) {
                          const schema_table = schema.findByType("model", {
                            name: rel.to.table,
                          });

                          let pks: Property[] = [];
                          if (schema_table) {
                            for (const col of schema_table.properties) {
                              if (col.type === "field" && !col.array) {
                                if (
                                  col.attributes &&
                                  col.attributes?.length > 0
                                ) {
                                  const is_pk = col.attributes.find(
                                    (e) => e.name === "id"
                                  );
                                  if (is_pk) {
                                    pks.push(col);
                                    break;
                                  }
                                }
                              }
                            }
                          }

                          rel_many[k] = {
                            to: rel.to.table,
                            select: new Set(),
                            from: rel.from.table,
                            pk: pks.map((e) => e.name),
                            ops: new Map(),
                          };
                        }

                        const tobe = createRelMany({
                          row,
                          k,
                          schema,
                          rel,
                        });

                        if (tobe) {
                          for (const row of tobe) {
                            for (const key of Object.keys(row)) {
                              rel_many[k].select.add(key);
                            }
                          }
                        }

                        rel_many[k].ops.set(row, {
                          delete: new Set(),
                          insert: new Set(),
                          tobe: tobe || [],
                        });
                      }
                    }
                  }
                }
              }

              const select = {} as any;
              for (const pk of pks) {
                select[pk.name] = true;
              }

              if (Object.keys(rel_many).length > 0) {
                for (const [k, v] of Object.entries(rel_many)) {
                  select[k] = { select: {} };
                  Object.values(v.pk).map((e) => (select[k].select[e] = true));
                  for (const e of v.select) {
                    select[k].select[e] = true;
                  }
                }
              }

              const existing: any[] = await prisma[table].findMany({
                where,
                select,
              });

              const updates = [] as any[];
              const inserts = [] as any[];
              const deletes = [] as any[];
              const exists_idx = new Set<number>();

              const marker = {} as any;
              for (const row of data) {
                const found = existing.find((item, idx) => {
                  for (const pk of pks) {
                    if (item[pk.name] !== row[pk.name]) return false;
                  }
                  exists_idx.add(idx);
                  return true;
                });

                if (mode !== "raw") {
                  for (const [k, v] of Object.entries(row) as any) {
                    const rel = rels[k];
                    if (rel) {
                      if (rel.type === "has-many" && rel_many[k]) {
                        delete row[k];
                        const current = rel_many[k].ops.get(row);
                        if (current && found && found[k] && current.tobe) {
                          let cur_matches = new Set<any>();
                          for (const tobe of current.tobe) {
                            let tobe_found = false;
                            for (const cur of found[k]) {
                              let matched_all = true;
                              for (const [k, v] of Object.entries(tobe)) {
                                if (cur[k] !== v) {
                                  matched_all = false;
                                  break;
                                }
                              }
                              if (matched_all) {
                                cur_matches.add(cur);
                                tobe_found = true;
                                break;
                              }
                            }
                            if (!tobe_found) {
                              current.insert.add(tobe);
                            }
                          }

                          for (const cur of found[k]) {
                            if (!cur_matches.has(cur)) {
                              current.delete.add(cur);
                            }
                          }

                          row[k] = {
                            createMany: { data: [...current.insert] },
                          };

                          if (current.delete.size > 0) {
                            for (const d of current.delete) {
                              transactions.push(
                                prisma[rel_many[k].to].delete({ where: d })
                              );
                            }
                          }
                        }
                      }
                    }
                  }
                }

                if (mode !== "raw") {
                  if (found) {
                    updates.push({ ...row, ...where });
                  } else {
                    inserts.push({ ...row, ...where });
                  }
                } else {
                  if (found) {
                    updates.push(row);
                  } else {
                    inserts.push(row);
                  }
                }
              }

              if (exists_idx.size !== existing.length) {
                for (const [k, v] of Object.entries(existing)) {
                  if (!exists_idx.has(parseInt(k))) {
                    deletes.push(v);
                  }
                }
              }

              if (inserts.length > 0) {
                for (const row of inserts) {
                  if (typeof row._marker !== "undefined") {
                    marker[transactions.length] = row._marker;
                    delete row._marker;
                  }

                  transactions.push(
                    prisma[table].create({
                      data: row,
                    })
                  );
                }
              }

              if (updates.length > 0) {
                for (const row of updates) {
                  const where = {} as any;
                  for (const pk of pks) {
                    where[pk.name] = row[pk.name];
                    delete row[pk.name];
                  }

                  if (typeof row._marker !== "undefined") {
                    marker[transactions.length] = row._marker;
                    delete row._marker;
                  }

                  if (pk_composite_rel) {
                    const comp_rel_val = {} as any;
                    for (const pk of pks) {
                      comp_rel_val[pk.name] = where[pk.name];
                      delete where[pk.name];
                    }
                    where[pk_composite_rel] = comp_rel_val;
                  }

                  transactions.push(
                    prisma[table].update({ data: row, where, select })
                  );
                }
              }

              if (deletes.length > 0) {
                for (const item of deletes) {
                  const where = {} as any;
                  for (const pk of pks) {
                    where[pk.name] = item[pk.name];
                  }

                  if (pk_composite_rel) {
                    const comp_rel_val = {} as any;
                    for (const pk of pks) {
                      comp_rel_val[pk.name] = where[pk.name];
                      delete where[pk.name];
                    }
                    where[pk_composite_rel] = comp_rel_val;
                  }

                  transactions.push(prisma[table].delete({ where }));
                }
              }

              const result = await prisma.$transaction(transactions);

              if (Object.keys(marker).length > 0) {
                for (const [k, v] of Object.entries(marker)) {
                  result[k]._marker = v;
                }
              }
              return result;
            }
          }
        }
      }
    }
  } else if (action === "batch_update") {
    const { table, batch } = params as unknown as {
      table?: { table: string; data: any; where: any }[];
      batch?: { table: string; data: any; where: any }[];
    };

    const promises = [] as any[];

    const b = table || batch;

    if (b) {
      try {
        for (const item of b) {
          if (
            item.table &&
            !!item.data &&
            !!item.where &&
            Object.entries(item.where).length > 0 &&
            Object.entries(item.data).length > 0
          ) {
            const tableInstance = prisma[item.table];
            if (tableInstance) {
              promises.push(
                tableInstance.updateMany({
                  where: item.where,
                  data: item.data,
                })
              );
            }
          }
        }
        await Promise.all(promises);
      } catch (e: any) {
        throw new Error(e.message);
      }
    }

    return;
  }
  if (action.startsWith("schema_")) {
    const schema_path = dir("app/db/prisma/schema.prisma");

    const schema = createPrismaSchemaBuilder(await readAsync(schema_path));

    if (action === "schema_tables") {
      const tables = schema.findAllByType("model", {}).map((e) => e?.name);
      const view = schema.findAllByType("view", {}).map((e) => e?.name);
      return [...tables, ...view];
    } else {
      let schema_table = schema.findAllByType("model", { name: table })?.[0];

      let is_view = false;
      if (!schema_table) {
        const view = schema.findAllByType("view", { name: table })?.[0];
        if (view) {
          is_view = true;
          schema_table = view as any;
        }
      }
      const columns = {} as Record<
        string,
        {
          is_pk: boolean;
          type: string;
          optional: boolean;
          db_type: string;
          default?: any;
        }
      >;
      if (schema_table) {
        const tables = schema
          .findAllByType("model", {})
          .map((e) => e?.name) as string[];

        if (action === "schema_rels") {
          return getRels({ schema_table, schema, table, tables });
        } else if (action === "schema_columns") {
          for (const col of schema_table.properties) {
            if (
              col.type === "attribute" &&
              col.name === "id" &&
              col.args[0].type === "attributeArgument" &&
              col.args[0].value
            ) {
              for (const colname of (col.args[0].value as any).args) {
                if (columns[colname]) {
                  columns[colname].is_pk = true;
                }
              }
            }
            if (col.type === "field" && !col.array) {
              if (col.attributes && col.attributes?.length > 0) {
                const attr = col.attributes.find(
                  (e) => e.name !== "id" && e.name !== "default"
                );

                const default_val = col.attributes.find(
                  (e) => e.name === "default"
                );
                let is_pk = col.attributes.find((e) => e.name === "id");

                let type = "String";
                if (typeof col.fieldType === "string") type = col.fieldType;

                if ((attr && attr.name !== "relation") || !attr) {
                  const db_type = attr
                    ? attr.name.toLowerCase()
                    : type.toLowerCase();
                  if (is_view && db_type === "unique") is_pk = true as any;

                  columns[col.name] = {
                    is_pk: !!is_pk,
                    type: type.toLowerCase(),
                    optional: !!col.optional,
                    db_type,
                    default: default_val,
                  };
                }
              } else if (
                typeof col.fieldType === "string" &&
                !tables.includes(col.fieldType)
              ) {
                columns[col.name] = {
                  is_pk: false,
                  type: col.fieldType.toLowerCase(),
                  optional: !!col.optional,
                  db_type: col.fieldType.toLowerCase(),
                  default: null,
                };
              }
            }
          }
          return columns;
        }
      }
    }
  }

  const tableInstance = prisma[table];

  if (tableInstance) {
    if (action === "query" && table.startsWith("$query")) {
      const gzip = params as unknown as string;

      const u8 = new Uint8Array([...atob(gzip)].map((c) => c.charCodeAt(0)));
      const json = JSON.parse((await gunzipAsync(u8)).toString("utf8"));

      if (table === "$queryRawUnsafe") {
        return await tableInstance.bind(prisma)(...json);
      }

      if (Array.isArray(json)) {
        const q = json.shift();
        const Prisma = (await import("../../app/db/db")).Prisma;
        return await tableInstance.bind(prisma)(Prisma.sql(q, ...json));
      }

      return [];
    }

    const method = tableInstance[action];

    if (method) {
      if (action === "deleteMany") {
        if (!params[0] || (params[0] && Object.keys(params[0]).length === 0))
          throw new Error("deleteMany without condition is forbidden");

        if (params[0] && params[0].where) {
          const filtered = Object.values(params[0].where).filter(
            (e) => e
          ).length;
          if (filtered === 0)
            throw new Error("deleteMany without condition is forbidden");
        }
      }

      const result = await method(...params);

      if (!result) {
        return JSON.stringify(result);
      }

      return result;
    }
  }
};

const getFieldAndRef = (rel: any, target: any, table: string) => {
  let field = null as unknown as { table: string; fields: string[] };
  let ref = null as unknown as { table: string; fields: string[] };
  for (const e of rel.args) {
    if (
      typeof e.value === "object" &&
      !Array.isArray(e.value) &&
      e.value.type === "keyValue" &&
      typeof e.value.value === "object" &&
      !Array.isArray(e.value.value) &&
      e.value.value.type === "array"
    ) {
      if (e.value.key === "fields") {
        field = {
          table: target.name,
          fields: e.value.value.args,
        };
      } else if (e.value.key === "references") {
        ref = {
          table: table,
          fields: e.value.value.args,
        };
      }
    }
  }
  return { field, ref };
};

const getRels = ({
  schema_table,
  schema,
  table,
  tables,
}: {
  schema_table: any;
  schema: ReturnType<typeof createPrismaSchemaBuilder>;
  table: any;
  tables: string[];
}) => {
  const rels = {} as Record<string, HasManyType | HasOneType>;
  for (const col of schema_table.properties) {
    if (
      col.type === "field" &&
      (!!col.array ||
        (col.attributes && col.attributes?.length > 0) ||
        tables.includes(col.fieldType))
    ) {
      if (col.array) {
        if (typeof col.fieldType === "string") {
          const target = schema.findByType("model", {
            name: col.fieldType,
          });

          if (target) {
            const field = target.properties.find((e: any) => {
              if (e.type === "field" && e.fieldType === table) {
                return true;
              }
            });
            if (field && field.type === "field") {
              const rel = field.attributes?.find(
                (e: any) => e.kind === "field"
              );

              if (rel && rel.args) {
                const { field, ref } = getFieldAndRef(rel, target, table);

                if (target && ref) {
                  rels[col.name] = {
                    type: "has-many",
                    to: field,
                    from: ref,
                  };
                }
              }
            }
          }
        }
      } else if (col.attributes) {
        const rel = col.attributes.find(
          (e: any) => e.type === "attribute" && e.name === "relation"
        );
        if (rel && typeof col.fieldType === "string") {
          const target = schema.findByType("model", {
            name: col.fieldType,
          });
          const { field, ref } = getFieldAndRef(rel, target, table);

          rels[col.name] = {
            type: "has-one",
            to: {
              table: field.table,
              fields: ref.fields,
            },
            from: {
              table: ref.table,
              fields: field.fields,
            },
          };
        }
      } else {
        const target = schema.findByType("model", {
          name: col.fieldType,
        });
        if (target) {
          const to = target.properties.find(
            (e) => e.type === "field" && e.fieldType === table
          );
          if (to && to.type === "field" && (to.attributes?.length || 0) > 0) {
            const rel = to.attributes?.find((e) => e.name === "relation");
            if (rel) {
              const { field, ref } = getFieldAndRef(rel, target, table);

              rels[col.name] = {
                type: "has-one",
                to: {
                  table: field.table,
                  fields: ref.fields,
                },
                from: {
                  table: ref.table,
                  fields: field.fields,
                },
              };
            }
          }
        }
      }
    }
  }
  return rels;
};
