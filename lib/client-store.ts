"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { executeFinanceCommand } from "./imports";
import { demoState, emptyState } from "./demo";
import type { Command, FinanceState } from "./types";

export type AppMode = "landing" | "demo" | "account";
const DEMO_KEY = "ia-financeira:demo:v1";
export const uid = () => crypto.randomUUID();
type StateResponse = { state: FinanceState; revision: number; generation: string; identity?: { localPreview?: boolean }; error?: string };

export function useFinance() {
  const [mode, setMode] = useState<AppMode>("landing");
  const [state, setState] = useState<FinanceState>(() => emptyState());
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [localPreview, setLocalPreview] = useState(false);
  const stateRef = useRef(state);
  const revisionRef = useRef(0);
  const generationRef = useRef("");
  const savingRef = useRef(false);
  const apply = useCallback((next: FinanceState, revision?: number, generation?: string) => {
    stateRef.current = next;
    setState(next);
    if (revision !== undefined) revisionRef.current = revision;
    if (generation !== undefined) generationRef.current = generation;
  }, []);
  const loadAccount = useCallback(async () => {
    const response = await fetch("/api/state", { credentials: "same-origin", cache: "no-store" });
    const data = await response.json() as StateResponse;
    if (!response.ok) throw new Error(response.status === 401 ? "Entre com sua conta para acessar seus registros. A demonstração continua disponível." : data.error || "Não foi possível carregar os dados. Tente novamente.");
    apply(data.state, data.revision, data.generation);
    setLocalPreview(Boolean(data.identity?.localPreview));
  }, [apply]);
  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get("mode");
    const initial: AppMode = requested === "account" ? "account" : requested === "demo" ? "demo" : "landing";
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Browser storage and identity mode are restored after SSR hydration.
    setMode(initial);
    async function initialize() {
      try {
        if (initial === "account") await loadAccount();
        if (initial === "demo") {
          const saved = localStorage.getItem(DEMO_KEY);
          if (saved) {
            try {
              const parsed = JSON.parse(saved);
              if (!parsed.profile || !Array.isArray(parsed.transactions) || !Array.isArray(parsed.goals)) throw new Error("Dados inválidos");
              apply(parsed);
            } catch {
              apply(demoState());
              setError("Os dados locais da demonstração foram recuperados para o exemplo inicial.");
            }
          } else apply(demoState());
        }
      } catch (e) { setError(e instanceof Error ? e.message : "Não foi possível abrir a conta."); }
      finally { setLoading(false); }
    }
    void initialize();
  }, [apply, loadAccount]);
  const enterDemo = useCallback(() => {
    setError("");
    let next = demoState();
    try { const saved = localStorage.getItem(DEMO_KEY); if (saved) next = JSON.parse(saved); } catch { /* Recover the public example. */ }
    apply(next);
    setMode("demo");
    window.history.pushState({}, "", "/?mode=demo");
  }, [apply]);
  const send = useCallback(async (type: string, payload: Record<string, unknown>, commandId = uid()) => {
    if (savingRef.current) throw new Error("Aguarde a gravação em andamento.");
    savingRef.current = true;
    setPending(true);
    const command: Command = { id: commandId, type, payload };
    try {
      if (mode === "demo") {
        const next = await executeFinanceCommand(stateRef.current, command);
        try { localStorage.setItem(DEMO_KEY, JSON.stringify(next)); }
        catch { throw new Error("O navegador não permitiu salvar a demonstração. Libere o armazenamento local e tente novamente."); }
        apply(next);
        return next;
      }
      if (mode !== "account") throw new Error("Abra uma demonstração ou entre em sua conta.");
      const response = await fetch("/api/command", {
        method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command, revision: revisionRef.current, generation: generationRef.current }),
      });
      const data = await response.json() as StateResponse;
      if (response.status === 409) {
        await loadAccount();
        throw new Error("Seus dados foram atualizados em outra janela. Revise os valores carregados e tente salvar novamente.");
      }
      if (!response.ok) throw new Error(data.error || "Não foi possível salvar. Seus dados anteriores foram preservados.");
      apply(data.state, data.revision, data.generation);
      return data.state as FinanceState;
    } finally { savingRef.current = false; setPending(false); }
  }, [apply, mode, loadAccount]);
  const resetDemo = useCallback((blank = false) => {
    const next = blank ? emptyState() : demoState();
    localStorage.setItem(DEMO_KEY, JSON.stringify(next));
    apply(next);
  }, [apply]);
  return { state, mode, loading, pending, error, localPreview, send, enterDemo, resetDemo, loadAccount, setError };
}
