export type HasManyType = {
  type: "has-many";
  to: { table: string; fields: string[] };
  from: { table: string; fields: string[] };
};

export type HasOneType = {
  type: "has-one";
  to: { table: string; fields: string[] };
  from: { table: string; fields: string[] };
};
