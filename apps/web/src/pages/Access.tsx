import {
  startAuthentication,
  startRegistration,
  type PublicKeyCredentialCreationOptionsJSON,
  type PublicKeyCredentialRequestOptionsJSON,
} from "@simplewebauthn/browser";
import { KeyRound, LogOut, UserPlus } from "lucide-react";
import { useState, type FormEvent } from "react";
import { useRole, useSessionCtx } from "../app/context";
import { Notice, PageHeader, Panel } from "../components/ui";
import { api } from "../lib/api";

type Msg = { kind: "ok" | "error"; text: string } | null;


function webauthnMessage(e: unknown): string {
  if (e instanceof Error) {
    if (e.name === "NotAllowedError") return "Operación cancelada o sin tiempo. Inténtalo de nuevo.";
    if (e.name === "InvalidStateError") return "Esta passkey ya está registrada en este dispositivo.";
    return e.message;
  }
  return "No se pudo completar la operación con la passkey";
}

export default function Access() {
  const session = useSessionCtx();
  const { authenticated, name, role } = useRole();
  const [busy, setBusy] = useState<string | null>(null);
  const [loginMsg, setLoginMsg] = useState<Msg>(null);
  const [regMsg, setRegMsg] = useState<Msg>(null);
  const [token, setToken] = useState("");
  const [userName, setUserName] = useState("");
  const [userRole, setUserRole] = useState<"admin" | "operator">("admin");

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
      setLoginMsg({ kind: "error", text: webauthnMessage(e) });
    } finally {
      setBusy(null);
    }
  }

  async function logout() {
    setBusy("logout");
    setLoginMsg(null);
    try {
      await api.logout();
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
      setRegMsg({ kind: "ok", text: "Passkey registrada. Ya puedes iniciar sesión." });
    } catch (err) {
      setRegMsg({ kind: "error", text: webauthnMessage(err) });
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
          {loginMsg ? <div className="mt-3"><Notice kind={loginMsg.kind}>{loginMsg.text}</Notice></div> : null}
        </Panel>

        <Panel title="Alta inicial" icon={<UserPlus size={16} aria-hidden="true" />}>
          <p className="m-0 mb-3 text-sm text-ink-2">
            Registra la primera passkey con el token de arranque entregado por el equipo (se usa una sola vez).
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
    </div>
  );
}
