interface ImportMeta {
  glob: <T>(
    pattern: string,
    options: { import: "default" },
  ) => Record<string, () => Promise<T>>;
}
