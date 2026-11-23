import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Guardia estatica (regresion "l is not a function" en movil): ningun useEffect /
 * useLayoutEffect puede usar una flecha concisa cuyo valor devuelto se tomaria como
 * funcion de limpieza. Se exige cuerpo con llaves.
 */
function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : /\.(tsx?|jsx?)$/.test(f) && !/\.test\./.test(f) ? [p] : [];
  });
}

describe("efectos de React", () => {
  it("no hay useEffect con flecha concisa (retorno implicito)", () => {
    const offenders: string[] = [];
    // Se permite "() => () => {...}" (devuelve explicitamente una funcion de limpieza).
    const re = /use(?:Layout)?Effect\(\s*\(\)\s*=>(?!\s*\{)(?!\s*\(\)\s*=>)/g;
    for (const f of files(join(__dirname, ".."))) {
      const src = readFileSync(f, "utf8");
      for (const m of src.matchAll(re)) {
        const line = src.slice(0, m.index).split("\n").length;
        offenders.push(`${f}:${line}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
