// Local vendored replacement for jsr:@std/assert
// Provides assertEquals and assertThrows used by engine tests

export function assertEquals<T>(actual: T, expected: T, msg?: string): void {
  if (!deepEqual(actual, expected)) {
    const actualStr = Deno.inspect(actual, { depth: 10 });
    const expectedStr = Deno.inspect(expected, { depth: 10 });
    throw new AssertionError(
      msg ??
        `Values are not equal.\n  actual:   ${actualStr}\n  expected: ${expectedStr}`,
    );
  }
}

export function assertThrows(
  fn: () => void,
  // deno-lint-ignore no-explicit-any
  errorClass?: new (...args: any[]) => Error,
  msgIncludes?: string,
  msg?: string,
): Error {
  let thrown: Error | undefined;
  try {
    fn();
  } catch (e) {
    if (e instanceof Error) {
      thrown = e;
    } else {
      thrown = new Error(String(e));
    }
  }
  if (!thrown) {
    throw new AssertionError(msg ?? "Expected function to throw.");
  }
  if (errorClass && !(thrown instanceof errorClass)) {
    throw new AssertionError(
      msg ??
        `Expected error to be instance of "${errorClass.name}", but got "${thrown.constructor.name}".`,
    );
  }
  if (msgIncludes && !thrown.message.includes(msgIncludes)) {
    throw new AssertionError(
      msg ??
        `Expected error message to include "${msgIncludes}", but got "${thrown.message}".`,
    );
  }
  return thrown;
}

class AssertionError extends Error {
  override name = "AssertionError";
  constructor(message: string) {
    super(message);
  }
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== typeof b) return false;
  if (a === null || b === null) return false;
  if (typeof a !== "object") return false;

  const objA = a as Record<string, unknown>;
  const objB = b as Record<string, unknown>;

  if (Array.isArray(objA) !== Array.isArray(objB)) return false;

  if (Array.isArray(objA) && Array.isArray(objB)) {
    if (objA.length !== objB.length) return false;
    return objA.every((v, i) => deepEqual(v, objB[i]));
  }

  const keysA = Object.keys(objA);
  const keysB = Object.keys(objB);
  if (keysA.length !== keysB.length) return false;

  return keysA.every((key) =>
    Object.prototype.hasOwnProperty.call(objB, key) &&
    deepEqual(objA[key], objB[key])
  );
}
