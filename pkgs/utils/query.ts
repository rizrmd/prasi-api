import { createPrismaSchemaBuilder } from "@mrleebo/prisma-ast";
import { readAsync } from "fs-jetpack";
import { Prisma } from "../../app/db/db";
import { dir } from "./dir";

export type DBArg = {
  db: string;
  table: string;
  action: string;
  params: any[];
};

export const execQuery = async (args: DBArg, prisma: any) => {
  const { table, action, params } = args;

  if (action === "batch_update") {
    const { table, batch } = params as unknown as {
      table: string;
      batch: { data: any; where: any }[];
    };

    const promises = [] as any[];

    const tableInstance = prisma[table];
    if (tableInstance) {
      try {
        for (const item of batch) {
          if (
            Object.entries(item.where).length > 0 &&
            Object.entries(item.data).length > 0
          ) {
            promises.push(
              tableInstance.updateMany({ where: item.where, data: item.data })
            );
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
      return tables || [];
    } else {
      const schema_table = schema.findByType("model", { name: table });
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
      const rels = {} as Record<
        string,
        | {
            type: "has-many";
            to: { table: string; fields: string[] };
            from: { table: string; fields: string[] };
          }
        | {
            type: "has-one";
            to: { table: string; fields: string[] };
            from: { table: string; fields: string[] };
          }
      >;
      if (schema_table) {
        if (action === "schema_rels") {
          for (const col of schema_table.properties) {
            if (
              col.type === "field" &&
              (!!col.array || (col.attributes && col.attributes?.length > 0))
            ) {
              if (col.array) {
                if (typeof col.fieldType === "string") {
                  const target = schema.findByType("model", {
                    name: col.fieldType,
                  });

                  if (target) {
                    const field = target.properties.find((e) => {
                      if (e.type === "field" && e.fieldType === table) {
                        return true;
                      }
                    });
                    if (field && field.type === "field") {
                      const rel = field.attributes?.find(
                        (e) => e.kind === "field"
                      );

                      if (rel && rel.args) {
                        const { field, ref } = getFieldAndRef(
                          rel,
                          target,
                          table
                        );

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
                  (e) => e.type === "attribute" && e.name === "relation"
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
              }
            }
          }
          return rels;
        } else if (action === "schema_columns") {
          for (const col of schema_table.properties) {
            if (
              col.type === "field" &&
              !col.array &&
              col.attributes &&
              col.attributes?.length > 0
            ) {
              const attr = col.attributes.find(
                (e) => e.name !== "id" && e.name !== "default"
              );

              const default_val = col.attributes.find(
                (e) => e.name === "default"
              );
              const is_pk = col.attributes.find((e) => e.name === "id");

              if (attr && attr.name !== "relation") {
                let type = "String";
                if (typeof col.fieldType === "string") type = col.fieldType;

                columns[col.name] = {
                  is_pk: !!is_pk,
                  type: type.toLowerCase(),
                  optional: !!col.optional,
                  db_type: attr.name.toLowerCase(),
                  default: default_val,
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
      try {
        const q = params.shift();
        return await tableInstance.bind(prisma)(Prisma.sql(q, ...params));
      } catch (e) {
        console.log(e);
        return e;
      }
    }

    const method = tableInstance[action];

    if (method) {
      try {
        const result = await method(...params);

        if (!result) {
          return JSON.stringify(result);
        }

        return result;
      } catch (e: any) {
        throw new Error(e.message);
      }
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
