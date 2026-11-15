export type GenerationMode = "migrate" | "jsPlugin";

export type PluginModule = {
  default: unknown;
} & Record<string, unknown>;

export interface PluginSpec {
  readonly name: string;
  readonly specifier: string;
  readonly mode: GenerationMode;
  readonly pick: (module: PluginModule) => unknown;

  /** Runtime package loaded through Oxlint's jsPlugins option. */
  readonly jsPluginSpecifier?: string;
  /** Stable rule namespace used when the runtime specifier is a package wrapper. */
  readonly jsPluginName?: string;
}

export type GenerationResult =
  | {
      readonly status: "generated";
      readonly plugin: string;
      readonly ruleCount: number;
      readonly outputPath: string;
    }
  | {
      readonly status: "skipped";
      readonly plugin: string;
      readonly reason: string;
      readonly outputPath: string;
    }
  | {
      readonly status: "failed";
      readonly plugin: string;
      readonly error: unknown;
    };
