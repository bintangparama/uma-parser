// Resolve against this module so both / and /repository/ deployments work.
export const appBase = new URL('./', import.meta.url);
export function assetURL(path) {
  return new URL(path, appBase).href;
}
