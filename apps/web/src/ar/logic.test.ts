import { describe, expect, it } from "vitest";
import { makeCampus, liveSpace } from "../twin/fixtures";
import { PALETTE } from "../twin/constants";
import {
  GLB_PATH,
  buildSceneViewerIntent,
  clampWidth,
  describeSpace,
  evaluateLevels,
  glbUrl,
  probeCapabilities,
  scaleForWidth,
  spaceColorMap,
  stepWidth,
  type CapabilityEnv,
} from "./logic";

const ANDROID_UA = "Mozilla/5.0 (Linux; Android 15; SM-S938B) AppleWebKit/537.36 Chrome/140.0 Mobile Safari/537.36";
const DESKTOP_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140.0 Safari/537.36";

function env(over: Partial<CapabilityEnv> = {}): CapabilityEnv {
  return {
    isSecureContext: true,
    protocol: "https:",
    hostname: "campuspulse.example.dev",
    userAgent: ANDROID_UA,
    xr: { isSessionSupported: async () => true },
    ...over,
  };
}

describe("probeCapabilities / evaluateLevels", () => {
  it("Android + HTTPS + WebXR: niveles A y B disponibles", async () => {
    const caps = await probeCapabilities(env());
    expect(caps).toMatchObject({ secure: true, https: true, hasWebXr: true, immersiveAr: true, android: true });
    const lv = evaluateLevels(caps, true);
    expect(lv.A.available).toBe(true);
    expect(lv.B.available).toBe(true);
    expect(lv.C.available).toBe(true);
  });

  it("escritorio sin WebXR: A y B no disponibles, C si, con motivos", async () => {
    const caps = await probeCapabilities(env({ userAgent: DESKTOP_UA, xr: undefined }));
    const lv = evaluateLevels(caps, true);
    expect(lv.A.available).toBe(false);
    expect(lv.A.reason).toMatch(/WebXR/);
    expect(lv.B.available).toBe(false);
    expect(lv.B.reason).toMatch(/Android/);
    expect(lv.C.available).toBe(true);
  });

  it("escritorio con WebXR pero sin immersive-ar: mensaje de escritorio", async () => {
    const caps = await probeCapabilities(env({ userAgent: DESKTOP_UA, xr: { isSessionSupported: async () => false } }));
    expect(evaluateLevels(caps, true).A.reason).toMatch(/escritorio/);
  });

  it("HTTP sin TLS: no se consulta WebXR y el motivo menciona HTTPS", async () => {
    let called = false;
    const caps = await probeCapabilities(
      env({
        isSecureContext: false,
        protocol: "http:",
        xr: {
          isSessionSupported: async () => {
            called = true;
            return true;
          },
        },
      }),
    );
    expect(called).toBe(false);
    const lv = evaluateLevels(caps, true);
    expect(lv.A.available).toBe(false);
    expect(lv.A.reason).toMatch(/HTTP sin TLS/);
    expect(lv.B.available).toBe(false);
  });

  it("localhost (contexto seguro por adb reverse): A si, B no", async () => {
    const caps = await probeCapabilities(env({ protocol: "http:", hostname: "localhost" }));
    const lv = evaluateLevels(caps, true);
    expect(caps.secure).toBe(true);
    expect(lv.A.available).toBe(true);
    expect(lv.B.available).toBe(false);
    expect(lv.B.reason).toMatch(/https pública/);
  });

  it("GLB no publicado desactiva B con mensaje claro; sin comprobar aun, queda pendiente", async () => {
    const caps = await probeCapabilities(env());
    expect(evaluateLevels(caps, false).B.reason).toMatch(/no está publicado/);
    expect(evaluateLevels(caps, null).B.available).toBe(false);
  });

  it("isSessionSupported que lanza error no rompe la deteccion", async () => {
    const caps = await probeCapabilities(
      env({
        xr: {
          isSessionSupported: async () => {
            throw new Error("SecurityError");
          },
        },
      }),
    );
    expect(caps.immersiveAr).toBe(false);
    expect(caps.probeError).toBe("SecurityError");
    expect(evaluateLevels(caps, true).A.reason).toMatch(/SecurityError/);
  });
});

describe("buildSceneViewerIntent", () => {
  it("construye el intent con el esquema, paquete y accion de ARCore", () => {
    const file = glbUrl("https://campuspulse.example.dev");
    expect(file).toBe(`https://campuspulse.example.dev${GLB_PATH}`);
    const i = buildSceneViewerIntent({ glbUrl: file, fallbackUrl: "https://campuspulse.example.dev/ar" });
    expect(i.startsWith("intent://arvr.google.com/scene-viewer/1.2?file=https://campuspulse.example.dev/models/utp-huancayo-mobile.glb")).toBe(true);
    expect(i).toContain("&mode=ar_preferred&title=CampusPulse%20360#Intent;");
    expect(i).toContain("scheme=https;package=com.google.ar.core;action=android.intent.action.VIEW;");
    expect(i).toContain("S.browser_fallback_url=https%3A%2F%2Fcampuspulse.example.dev%2Far;end;");
  });

  it("codifica el parametro file cuando la URL lleva query", () => {
    const i = buildSceneViewerIntent({ glbUrl: "https://x.dev/m.glb?v=1&b=2", fallbackUrl: "https://x.dev/ar" });
    expect(i).toContain("file=https%3A%2F%2Fx.dev%2Fm.glb%3Fv%3D1%26b%3D2&mode=");
  });
});

describe("escala de maqueta", () => {
  it("limita el ancho entre 0,2 y 2 m y escala geometricamente", () => {
    expect(clampWidth(0.01)).toBe(0.2);
    expect(clampWidth(99)).toBe(2);
    expect(clampWidth(Number.NaN)).toBe(0.6);
    expect(stepWidth(0.6, 1)).toBeCloseTo(0.75, 3);
    expect(stepWidth(0.6, -1)).toBeCloseTo(0.48, 3);
    expect(stepWidth(2, 1)).toBe(2);
    expect(stepWidth(0.2, -1)).toBe(0.2);
  });
  it("scaleForWidth da 0,6 m para un edificio de 48 m", () => {
    expect(scaleForWidth(0.6, 48)).toBeCloseTo(0.0125, 6);
    expect(scaleForWidth(0.6, 0)).toBe(1);
  });
});

describe("datos vivos -> colores y etiquetas", () => {
  const campus = makeCampus();

  it("colorea con colorForSpace; sin dato u offline queda gris", () => {
    const live = {
      generated_at: 1,
      summary: {} as never,
      spaces: [liveSpace("critical", { co2_ppm: 1700 }, "SPC_3_A301"), liveSpace("ok", {}, "SPC_2_A201"), liveSpace("offline", null, "SPC_2_A202")],
    } as never;
    const m = spaceColorMap(campus, live);
    expect(m.get("SPC_3_A301")).toBe(PALETTE.critical);
    expect(m.get("SPC_2_A201")).toBe(PALETTE.cyan);
    expect(m.get("SPC_2_A202")).toBe(PALETTE.offline);
    expect(m.get("SPC_1_BIB")).toBe(PALETTE.offline);
    expect(m.size).toBe(campus.spaces.length);
  });

  it("sin instantanea todo es offline; la capa co2 usa la rampa", () => {
    expect([...spaceColorMap(campus, null).values()].every((c) => c === PALETTE.offline)).toBe(true);
    const live = { generated_at: 1, summary: {} as never, spaces: [liveSpace("ok", { co2_ppm: 400 }, "SPC_3_A301")] } as never;
    expect(spaceColorMap(campus, live, "co2").get("SPC_3_A301")).toBe(PALETTE.cyan);
  });

  it("describeSpace muestra nombre, estado, CO2 y ocupacion", () => {
    const space = campus.spaces.find((s) => s.id === "SPC_3_A301")!;
    const info = describeSpace(space, liveSpace("warning", { co2_ppm: 1203.6, occupancy: 31 }, "SPC_3_A301"));
    expect(info.name).toContain("Aula A301");
    expect(info.status).toBe("Advertencia");
    expect(info.co2).toBe("1204 ppm");
    expect(info.occupancy).toBe("31 / 45 personas");
    expect(info.source).toBe("sim");
    const off = describeSpace(space, undefined);
    expect(off).toMatchObject({ status: "Sin datos", co2: "Sin dato", occupancy: "Sin dato" });
  });
});
