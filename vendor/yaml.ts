// Local vendored replacement for jsr:@std/yaml
// Uses npm:yaml package which is accessible via npmjs.org

// deno-lint-ignore no-import-prefix
import YAML from "npm:yaml@2";

/** Parse a YAML string into a JavaScript object. */
// deno-lint-ignore no-explicit-any
export function parse(content: string): any {
  return YAML.parse(content);
}
