export const nodeRange: { min: string; maxExclusive: string };
export const sourceExtensions: string[];
export const testFileSuffixes: string[];
export const testDirectories: string[];
export function expandTestGlobs(
  prefix?: string,
  extensions?: string[],
): string[];
export function expandTestIncludeGlobs(
  prefix?: string,
  extensions?: string[],
): string[];
export function isTestFile(relativePath: string): boolean;
export const workspacePackages: { name: string; dir: string; group: string }[];
export const workspaceScope: string;
export const yandexProviderDir: string;
export const yandexSdkModules: string[];
export const forbiddenCorePeerEdges: {
  from: string;
  to: string;
  origin: string;
}[];
export function allowedEdges(group: string): {
  value: string[];
  typeOnly: string[];
};
export const testingConsumerGroups: string[];
export const forbiddenModulesByGroup: Record<
  string,
  { module: string; origin: string; prefix?: boolean }[]
>;
export const sharedForbiddenGlobals: string[];
export const globalScopeObjects: string[];
export const sharedTestAllowedModules: string[];
