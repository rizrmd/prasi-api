type Path = string | Array<string | number>;

export function get<T, K>(object: T, path: Path, defaultValue?: K): K | undefined {
  const pathArray = Array.isArray(path)
    ? path
    : path.match(/([^[.\]])+/g) || [];

  return (
    pathArray.reduce((acc, key) => {
      if (acc && typeof acc === "object") {
        return (acc as any)[key];
      }
      return undefined;
    }, object as any) ?? defaultValue
  );
}
