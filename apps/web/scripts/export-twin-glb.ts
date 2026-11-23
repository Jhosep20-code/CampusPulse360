/*
 * Exporta la geometria PROCEDURAL provisional del gemelo a un GLB estatico para
 * la AR de nivel B (Scene Viewer de ARCore, que exige una URL https publica).
 *
 * Uso (Node >= 22.18 / 24, quita tipos de TypeScript por su cuenta):
 *   node apps/web/scripts/export-twin-glb.ts
 *
 * Salida: apps/web/public/models/campus-ar.glb
 *
 * - Reutiliza las funciones puras de src/twin (layout, facade, constants) a
 *   traves de src/ar/model.ts. Fixture: src/twin/fixtures.ts (seed provisional).
 * - Escala en metros, Y arriba. Las mallas de espacio se llaman SPC_<piso>_<codigo>
 *   y llevan material con el color de estado "ok" (cian).
 * - Las dimensiones son ESTIMACIONES (no mediciones del edificio real).
 */
import { registerHooks } from "node:module";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(here, "../public/models/campus-ar.glb");
const MAX_BYTES = 2 * 1024 * 1024;

// Los modulos de src/ importan con rutas sin extension ("./constants", pensadas para Vite).
// Node exige la extension: este hook reintenta con ".ts" solo para rutas relativas.
registerHooks({
  resolve(specifier, context, nextResolve) {
    try {
      return nextResolve(specifier, context);
    } catch (e) {
      const code = (e as { code?: string }).code;
      if (code === "ERR_MODULE_NOT_FOUND" && specifier.startsWith(".") && !/\.[cm]?[jt]sx?$/.test(specifier)) {
        return nextResolve(`${specifier}.ts`, context);
      }
      throw e;
    }
  },
});

// GLTFExporter usa Blob y FileReader (navegador). Node trae Blob; falta FileReader.
class FileReaderPolyfill {
  result: ArrayBuffer | string | null = null;
  onloadend: ((ev: { target: FileReaderPolyfill }) => void) | null = null;
  onload: ((ev: { target: FileReaderPolyfill }) => void) | null = null;
  onerror: ((err: unknown) => void) | null = null;
  readAsArrayBuffer(blob: Blob): void {
    blob.arrayBuffer().then(
      (buf) => this.finish(buf),
      (err) => this.onerror?.(err),
    );
  }
  readAsDataURL(blob: Blob): void {
    blob.arrayBuffer().then(
      (buf) => this.finish(`data:${blob.type || "application/octet-stream"};base64,${Buffer.from(buf).toString("base64")}`),
      (err) => this.onerror?.(err),
    );
  }
  private finish(result: ArrayBuffer | string): void {
    this.result = result;
    this.onload?.({ target: this });
    this.onloadend?.({ target: this });
  }
}
if (typeof (globalThis as { FileReader?: unknown }).FileReader === "undefined") {
  (globalThis as { FileReader?: unknown }).FileReader = FileReaderPolyfill;
}

const src = (rel: string) => pathToFileURL(resolve(here, "../src", rel)).href;
const { GLTFExporter } = await import("three/addons/exporters/GLTFExporter.js");
const { buildCampusModel } = (await import(src("ar/model.ts"))) as typeof import("../src/ar/model");
const { makeCampus } = (await import(src("twin/fixtures.ts"))) as typeof import("../src/twin/fixtures");

const campus = makeCampus();
const model = buildCampusModel(campus);
model.group.updateMatrixWorld(true);

const exporter = new GLTFExporter();
const result = await exporter.parseAsync(model.group, { binary: true, onlyVisible: true });
if (!(result instanceof ArrayBuffer)) throw new Error("GLTFExporter no devolvio un ArrayBuffer binario");

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, Buffer.from(result));
model.dispose();

// ---- Validacion del archivo escrito ----
const buf = readFileSync(OUT);
const magic = buf.subarray(0, 4).toString("ascii");
const version = buf.readUInt32LE(4);
const total = buf.readUInt32LE(8);
const jsonLen = buf.readUInt32LE(12);
const jsonType = buf.subarray(16, 20).toString("ascii");
const json = JSON.parse(buf.subarray(20, 20 + jsonLen).toString("utf8")) as {
  nodes?: Array<{ name?: string }>;
  meshes?: unknown[];
  materials?: unknown[];
  asset?: { generator?: string };
};
const names = (json.nodes ?? []).map((n) => n.name ?? "");
const spc = names.filter((n) => n.startsWith("SPC_"));
const expected = campus.spaces.map((s) => s.mesh_id);
const missing = expected.filter((m) => !spc.includes(m));

const problems: string[] = [];
if (magic !== "glTF") problems.push(`cabecera invalida: "${magic}"`);
if (version !== 2) problems.push(`version glTF ${version} (se esperaba 2)`);
if (total !== buf.length) problems.push(`longitud de cabecera ${total} != tamano real ${buf.length}`);
if (jsonType !== "JSON") problems.push(`primer chunk "${jsonType}" (se esperaba JSON)`);
if (missing.length > 0) problems.push(`faltan mallas: ${missing.join(", ")}`);
if (buf.length > MAX_BYTES) problems.push(`tamano ${buf.length} B supera el objetivo de 2 MB`);

console.log(`Archivo : ${OUT}`);
console.log(`Tamano  : ${buf.length} B (${(buf.length / 1024).toFixed(1)} KiB, objetivo <= 2 MiB)`);
console.log(`Cabecera: "${magic}" v${version}, ${json.meshes?.length ?? 0} mallas, ${json.materials?.length ?? 0} materiales, ${names.length} nodos`);
console.log(`SPC_*   : ${spc.length}/${expected.length} (${spc.join(", ")})`);
console.log("Geometria PROVISIONAL (dimensiones estimadas, no medidas). Datos de estado fijos en 'ok'.");
if (problems.length > 0) {
  console.error(`FALLO: ${problems.join("; ")}`);
  process.exit(1);
}
console.log("OK");
