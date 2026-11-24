import { describe, expect, it } from "vitest";
import { formatLinkCode, webauthnMessage } from "./Access";

function err(name: string): Error {
  const e = new Error("x");
  e.name = name;
  return e;
}

describe("mensajes de passkey", () => {
  it("un login cancelado o sin passkey en el dispositivo orienta a Alta inicial o vinculacion (no es fallo de registro)", () => {
    const m = webauthnMessage(err("NotAllowedError"), "login");
    expect(m).toContain("Alta inicial");
    expect(m).toContain("código");
    expect(webauthnMessage(err("NotAllowedError"), "register")).not.toContain("Alta inicial");
  });

  it("distingue dominio incorrecto, passkey duplicada y navegador sin soporte", () => {
    expect(webauthnMessage(err("SecurityError"), "login")).toContain("dominio");
    expect(webauthnMessage(err("InvalidStateError"), "register")).toContain("ya tiene una passkey");
    expect(webauthnMessage(err("NotSupportedError"), "login")).toContain("no admite passkeys");
  });

  it("formatea el codigo de vinculacion en dos grupos de cinco", () => {
    expect(formatLinkCode("ABCDE23456")).toBe("ABCDE-23456");
    expect(formatLinkCode("ABC")).toBe("ABC");
  });
});
