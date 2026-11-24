import {
  startAuthentication,
  startRegistration,
  type PublicKeyCredentialCreationOptionsJSON,
  type PublicKeyCredentialRequestOptionsJSON,
} from "@simplewebauthn/browser";
import { KeyRound, Link2, LogOut, Smartphone, UserPlus } from "lucide-react";
import { useState, type FormEvent } from "react";
import { useRole, useSessionCtx } from "../app/context";
import { Notice, PageHeader, Panel } from "../components/ui";
import { api } from "../lib/api";

type Msg = { kind: "ok" | "error"; text: string } | null;

/** Mensaje claro segun la operacion: un login sin passkey en el dispositivo NO es un fallo de registro. */
export function webauthnMessage(e: unknown, op: "login" | "register"): string {
  if (e instanceof Error) {
    if (e.name === "NotAllowedError") {
      return op === "login"
        ? "No se completó el inicio de sesión. Si este dispositivo todavía no tiene una passkey de CampusPulse 360 " +
            "(Windows puede mostrar «Algo ha ido mal»), primero regístrala en «Alta inicial» o vincúlala con un código. " +
            "Si sí la tiene, vuelve a intentarlo y confirma con tu huella, rostro o PIN."
        : "Se canceló o expiró la creación de la passkey. Vuelve a intentarlo y confirma con tu huella, rostro o PIN.";
    }
    if (e.name === "InvalidStateError") return "Este dispositivo ya tiene una passkey para esta cuenta. Usa «Iniciar sesión con passkey».";
    if (e.name === "SecurityError") return "El dominio no coincide con la configuración de passkeys. Abre la dirección pública oficial de la demo.";
    if (e.name === "NotSupportedError") return "Este navegador no admite passkeys. Usa Chrome o Edge actualizados.";
    return e.message;
  }
  return "No se pudo completar la operación con la passkey";
}

/** XXXXX-XXXXX para dictar o copiar el codigo con menos errores. */
export function formatLinkCode(code: string): string {
  return code.length === 10 ? `${code.slice(0, 5)}-${code.slice(5)}` : code;
}

export default function Access() {
  const session = useSessionCtx();
  const { authenticated, name, role } = useRole();
  const [busy, setBusy] = useState<string | null>(null);
  const [loginMsg, setLoginMsg] = useState<Msg>(null);
  const [regMsg, setRegMsg] = useState<Msg>(null);
  const [linkMsg, setLinkMsg] = useState<Msg>(null);
  const [token, setToken] = useState("");
  const [userName, setUserName] = useState("");
  const [userRole, setUserRole] = useState<"admin" | "operator">("admin");
  const [linkCode, setLinkCode] = useState("");
  const [issued, setIssued] = useState<{ code: string; expires_at: number } | null>(null);

  async function login() {
    setBusy("login");
    setLoginMsg(null);
    try {
      const opts = await api.passkeyLoginOptions();
      const optionsJSON = opts.options as unknown as PublicKeyCredentialRequestOptionsJSON;
      const response = await startAuthentication({ optionsJSON });
      await api.passkeyLoginVerify(opts.challenge_id, response);
      session.reload();
      setLoginMsg({ kind: "ok", text: "Sesión iniciada." });
    } catch (e) {
      setLoginMsg({ kind: "error", text: webauthnMessage(e, "login") });
    } finally {
      setBusy(null);
    }
  }

  async function logout() {
    setBusy("logout");
    setLoginMsg(null);
    try {
      await api.logout();
      setIssued(null);
      session.reload();
      setLoginMsg({ kind: "ok", text: "Sesión cerrada." });
    } catch (e) {
      setLoginMsg({ kind: "error", text: e instanceof Error ? e.message : "No se pudo cerrar la sesión" });
    } finally {
      setBusy(null);
    }
  }

  async function register(e: FormEvent) {
    e.preventDefault();
    setBusy("register");
    setRegMsg(null);
    const body = { bootstrap_token: token.trim(), name: userName.trim(), role: userRole };
    try {
      const opts = await api.passkeyRegisterOptions(body);
      const optionsJSON = opts.options as unknown as PublicKeyCredentialCreationOptionsJSON;
      const response = await startRegistration({ optionsJSON });
      await api.passkeyRegisterVerify(opts.challenge_id, response);
      setToken("");
      session.reload();
      setRegMsg({ kind: "ok", text: "Passkey registrada y sesión iniciada. El token de arranque ya no se puede volver a usar." });
    } catch (err) {
      setRegMsg({ kind: "error", text: webauthnMessage(err, "register") });
    } finally {
      setBusy(null);
    }
  }

  async function issueCode() {
    setBusy("issue");
    setLinkMsg(null);
    try {
      setIssued(await api.passkeyLinkCode());
    } catch (e) {
      setLinkMsg({ kind: "error", text: e instanceof Error ? e.message : "No se pudo generar el código" });
    } finally {
      setBusy(null);
    }
  }

  async function linkDevice(e: FormEvent) {
    e.preventDefault();
    setBusy("link");
    setLinkMsg(null);
    try {
      const opts = await api.passkeyLinkOptions(linkCode.trim());
      const optionsJSON = opts.options as unknown as PublicKeyCredentialCreationOptionsJSON;
      const response = await startRegistration({ optionsJSON });
      await api.passkeyRegisterVerify(opts.challenge_id, response);
      setLinkCode("");
      session.reload();
      setLinkMsg({ kind: "ok", text: "Dispositivo vinculado y sesión iniciada. A partir de ahora usa «Iniciar sesión con passkey»." });
    } catch (err) {
      setLinkMsg({ kind: "error", text: webauthnMessage(err, "register") });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div>
      <PageHeader title="Acceso" subtitle="Inicio de sesión sin contraseña mediante passkey (WebAuthn). El visitante anónimo solo tiene lectura." />
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Iniciar sesión" icon={<KeyRound size={16} aria-hidden="true" />}>
          <p className="m-0 mb-3 text-sm text-ink-2" role="status">
            {session.loading
              ? "Comprobando sesión…"
              : session.error
                ? `No se pudo comprobar la sesión: ${session.error.message}`
                : authenticated
                  ? `Sesión activa: ${name ?? "usuario"} (${role === "admin" ? "administrador" : "operador"}).`
                  : "Estás como visitante (solo lectura)."}
          </p>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn btn-primary" onClick={login} disabled={busy !== null}>
              <KeyRound size={16} aria-hidden="true" /> {busy === "login" ? "Esperando passkey…" : "Iniciar sesión con passkey"}
            </button>
            <button type="button" className="btn" onClick={logout} disabled={busy !== null || !authenticated}>
              <LogOut size={16} aria-hidden="true" /> Cerrar sesión
            </button>
          </div>
          <p className="m-0 mt-3 text-xs text-ink-2">
            Solo funciona en un dispositivo que ya tenga una passkey de esta cuenta (registrada aquí o vinculada con un código).
          </p>
          {loginMsg ? <div className="mt-3"><Notice kind={loginMsg.kind}>{loginMsg.text}</Notice></div> : null}
        </Panel>

        {authenticated ? (
          <Panel title="Vincular otro dispositivo" icon={<Smartphone size={16} aria-hidden="true" />}>
            <p className="m-0 mb-3 text-sm text-ink-2">
              Genera un código de un solo uso (10 minutos) para crear una passkey de <strong>tu misma cuenta</strong> en otro
              dispositivo, por ejemplo tu teléfono. No crea usuarios ni cambia roles.
            </p>
            <button type="button" className="btn btn-primary" onClick={issueCode} disabled={busy !== null}>
              <Link2 size={16} aria-hidden="true" /> {busy === "issue" ? "Generando…" : "Generar código"}
            </button>
            {issued ? (
              <div className="mt-3 rounded-lg border border-line p-3">
                <p className="m-0 text-xs text-ink-2">Código (válido hasta las {new Date(issued.expires_at).toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" })}):</p>
                <p className="num m-0 mt-1 text-2xl tracking-widest" aria-live="polite">{formatLinkCode(issued.code)}</p>
                <p className="m-0 mt-2 text-xs text-ink-2">
                  En el otro dispositivo abre esta misma página → «Vincular este dispositivo», escribe el código y confirma con tu huella,
                  rostro o PIN. Generar un código nuevo invalida el anterior.
                </p>
              </div>
            ) : null}
            {linkMsg ? <div className="mt-3"><Notice kind={linkMsg.kind}>{linkMsg.text}</Notice></div> : null}
          </Panel>
        ) : (
          <div className="grid gap-4">
            <Panel title="Vincular este dispositivo" icon={<Smartphone size={16} aria-hidden="true" />}>
              <p className="m-0 mb-3 text-sm text-ink-2">
                ¿Ya tienes cuenta en otro dispositivo? Genera allí un código en «Vincular otro dispositivo» y escríbelo aquí.
              </p>
              <form onSubmit={linkDevice} className="space-y-3">
                <div>
                  <label htmlFor="linkcode" className="mb-1 block text-xs font-medium text-ink-2">Código de vinculación</label>
                  <input id="linkcode" type="text" inputMode="text" autoComplete="one-time-code" autoCapitalize="characters" spellCheck={false}
                    className="field num" value={linkCode} onChange={(e) => setLinkCode(e.target.value)} placeholder="XXXXX-XXXXX" />
                </div>
                <button type="submit" className="btn btn-primary" disabled={busy !== null || linkCode.replace(/[\s-]/g, "").length < 10}>
                  <Link2 size={16} aria-hidden="true" /> {busy === "link" ? "Vinculando…" : "Vincular con passkey"}
                </button>
              </form>
              {linkMsg ? <div className="mt-3"><Notice kind={linkMsg.kind}>{linkMsg.text}</Notice></div> : null}
            </Panel>

            <Panel title="Alta inicial" icon={<UserPlus size={16} aria-hidden="true" />}>
              <p className="m-0 mb-3 text-sm text-ink-2">
                Registra la <strong>primera</strong> cuenta con el token de arranque del equipo. El token se usa una sola vez.
              </p>
              <form onSubmit={register} className="space-y-3">
                <div>
                  <label htmlFor="bootstrap" className="mb-1 block text-xs font-medium text-ink-2">Token de arranque</label>
                  <input id="bootstrap" type="password" autoComplete="off" required className="field num" value={token} onChange={(e) => setToken(e.target.value)} />
                </div>
                <div>
                  <label htmlFor="nombre" className="mb-1 block text-xs font-medium text-ink-2">Nombre</label>
                  <input id="nombre" type="text" autoComplete="name" required minLength={2} maxLength={60} className="field" value={userName} onChange={(e) => setUserName(e.target.value)} />
                </div>
                <div>
                  <label htmlFor="rol" className="mb-1 block text-xs font-medium text-ink-2">Rol</label>
                  <select id="rol" className="field" value={userRole} onChange={(e) => setUserRole(e.target.value as "admin" | "operator")}>
                    <option value="admin">Administrador</option>
                    <option value="operator">Operador</option>
                  </select>
                </div>
                <button type="submit" className="btn btn-primary" disabled={busy !== null || !token.trim() || !userName.trim()}>
                  <UserPlus size={16} aria-hidden="true" /> {busy === "register" ? "Registrando…" : "Registrar passkey"}
                </button>
              </form>
              {regMsg ? <div className="mt-3"><Notice kind={regMsg.kind}>{regMsg.text}</Notice></div> : null}
            </Panel>
          </div>
        )}
      </div>
    </div>
  );
}
