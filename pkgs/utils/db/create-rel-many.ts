import { createPrismaSchemaBuilder, Field } from "@mrleebo/prisma-ast";
import { get } from "utils/get";
import { HasManyType } from "./types";

export const createRelMany = (arg: {
  row: any;
  k: string;
  schema: ReturnType<typeof createPrismaSchemaBuilder>;
  rel: HasManyType;
}) => {
  const { row, k, schema, rel } = arg;

  if (Array.isArray(row[k])) {
    const create_many: any[] = row[k].map((e) => {
      const item = {} as any;
      const rel_fields = schema.findByType("model", {
        name: rel.to.table,
      });

      if (rel_fields && rel_fields.properties.length > 0) {
        const fields: Record<string, Field> = {};
        for (const f of Object.values(rel_fields.properties)) {
          if (f.type === "field") {
            fields[f.name] = f;
          }
        }
        for (const [k, v] of Object.entries(e)) {
          const f = fields[k];
          if (f && k !== rel.from.table) {
            const is_rel = f.attributes?.find(
              (e) => e.kind === "field" && e.name === "relation"
            );
            if (is_rel) {
              let to_field_raw = is_rel.args?.find(
                (e) =>
                  e.type === "attributeArgument" && get(e, "value.value.args.0")
              );

              if (to_field_raw) {
                const to_field = get(
                  to_field_raw,
                  "value.value.args.0"
                ) as string;
                if (typeof v === "object" && (v as any)?.connect) {
                  const pk = Object.values((v as any).connect)[0];
                  if (pk) {
                    delete item[k];
                    item[to_field] = pk;
                  }
                }
              }
            } else {
              item[k] = v;
            }
          }
        }
      }
      return item;
    });
    return create_many
  }
};
