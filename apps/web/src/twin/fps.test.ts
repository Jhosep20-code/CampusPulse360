import { describe, expect, it } from "vitest";
import { BODY_RADIUS, PLAN, canStand, doorCenters, moveWithCollisions, planarAxes, spawnPoint, walkArea } from "./fps";

describe("recorrido en primera persona: colisiones con el plan del GLB de Blender", () => {
  it("las puertas siguen la formula de build_rooms (5 puertas en 36,4 m)", () => {
    expect(doorCenters().map((x) => +x.toFixed(2))).toEqual([-14.56, -7.28, 0, 7.28, 14.56]);
  });

  it("el punto de aparicion es caminable en los 10 pisos", () => {
    for (let i = 0; i < 10; i++) {
      const p = spawnPoint(i);
      expect(canStand(walkArea(i), p.x, p.z), `piso ${i + 1}`).toBe(true);
    }
  });

  it("planta baja: sale del hall al pasillo SOLO por la puerta", () => {
    const area = walkArea(0);
    const p = spawnPoint(0);
    const through = moveWithCollisions(area, p.x, p.z, 0, -6); // de frente, por la puerta central
    expect(through.z).toBeLessThan(PLAN.partitionZ - 0.5);
    const wall = moveWithCollisions(area, 3.6, p.z, 0, -6); // a 3,6 m de la puerta: tabique macizo
    expect(wall.z).toBeGreaterThan(PLAN.partitionZ);
  });

  it("no atraviesa los muros exteriores: se desliza por ellos", () => {
    const area = walkArea(3);
    const p = spawnPoint(3);
    // Pasillo frontal hacia el este: termina donde termina el pasillo del modelo (borde este del nucleo).
    const corridor = moveWithCollisions(area, p.x, p.z, 80, 0);
    expect(corridor.x).toBeCloseTo(PLAN.core.maxX - BODY_RADIUS, 1);
    // Dentro de un ambiente: muro exterior este, y desliza en diagonal en vez de detenerse.
    const room = moveWithCollisions(area, 0, 10, 80, 0);
    expect(room.x).toBeCloseTo(PLAN.W / 2 - PLAN.wallInset - BODY_RADIUS, 1);
    const diag = moveWithCollisions(area, 0, 10, 80, 80);
    expect(diag.z).toBeCloseTo(PLAN.DP / 2 - PLAN.frontSetback - BODY_RADIUS, 1);
  });

  it("desde P2 no se puede caer al vacio del atrio; en la planta baja el atrio es suelo salvo la escalera", () => {
    const a = PLAN.atrium;
    expect(canStand(walkArea(4), 3, 0)).toBe(false);
    expect(canStand(walkArea(0), 3, 0)).toBe(true);
    expect(canStand(walkArea(0), -2.5, 0)).toBe(false); // tramos de escalera
    const p = spawnPoint(4);
    const r = moveWithCollisions(walkArea(4), p.x, p.z, 0, -20);
    expect(r.z).toBeGreaterThanOrEqual(a.maxZ + BODY_RADIUS - 1e-9);
  });

  it("el nucleo de ascensores es obstaculo en todos los pisos", () => {
    for (let i = 0; i < 10; i++) expect(canStand(walkArea(i), 13, 0)).toBe(false);
  });

  it("los ejes de movimiento siguen la orientacion de la camara", () => {
    const a = planarAxes(0);
    expect(a.fz).toBeCloseTo(-1);
    expect(a.rx).toBeCloseTo(1);
    const b = planarAxes(Math.PI / 2);
    expect(b.fx).toBeCloseTo(-1);
    expect(b.rz).toBeCloseTo(-1);
  });
});
