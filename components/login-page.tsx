"use client";

import { useState, type FormEvent } from "react";
import { ArrowLeft, ArrowRight, Check, LockKeyhole, ShieldCheck, Sprout } from "lucide-react";

export default function LoginPage({ localPreviewAvailable }: { localPreviewAvailable: boolean }) {
  const [step, setStep] = useState<"email" | "password">("email");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirmation, setPasswordConfirmation] = useState("");
  const [message, setMessage] = useState("");

  function continueToMicrosoft() {
    if (localPreviewAvailable) {
      setMessage("O Microsoft Entra ainda não está conectado nesta prévia local. Use o acesso de demonstração para explorar os dados e os recursos.");
      return;
    }

    const destination = new URL("/.auth/login/aad", window.location.origin);
    destination.searchParams.set("post_login_redirect_uri", "/?mode=account");
    if (email.trim()) destination.searchParams.set("login_hint", email.trim());
    window.location.assign(destination.pathname + destination.search);
  }

  function continueWithGoogle() {
    setMessage("O login com Google ainda não está configurado. Por enquanto, use Acessar demonstração abaixo para explorar a aplicação.");
  }

  function continueWithEmail(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    if (!localPreviewAvailable) {
      setMessage("O cadastro com e-mail e senha ainda não está configurado. Por enquanto, use Acessar demonstração para explorar a aplicação.");
      return;
    }
    setStep("password");
  }

  function createPreviewPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (password !== passwordConfirmation) {
      setMessage("As senhas não coincidem. Confira os dois campos e tente novamente.");
      return;
    }
    setPassword("");
    setPasswordConfirmation("");
    setMessage("Esta é uma prévia: a senha não foi salva nem enviada. O cadastro seguro por e-mail ainda não está configurado; use a demonstração para continuar.");
  }

  function backToEmail() {
    setPassword("");
    setPasswordConfirmation("");
    setMessage("");
    setStep("email");
  }

  return <main className="login-page">
    <header className="login-nav">
      <a href="/" className="login-brand" aria-label="IA Financeira, início">
        <span className="brand-mark"><Sprout size={23} strokeWidth={1.8} /></span>
        <span>IA<span className="brand-light">Financeira</span></span>
      </a>
      <a href="/" className="text-link"><ArrowLeft size={16} /> Página inicial</a>
    </header>

    <section className="login-layout">
      <div className="login-intro">
        <span className="pill"><span className="dot" /> UM PASSO POSSÍVEL, TODOS OS DIAS</span>
        <h1>Seu espaço para cuidar do que importa.</h1>
        <p>Entre para organizar seus lançamentos, acompanhar seus planos e entender seu mês com mais clareza.</p>
        <ul className="login-benefits">
          <li><span><Check size={15} /></span> Seus dados financeiros em um só lugar</li>
          <li><span><Check size={15} /></span> Metas e compromissos no seu ritmo</li>
          <li><span><Check size={15} /></span> Você decide o que registrar e compartilhar</li>
        </ul>
        <div className="login-privacy"><ShieldCheck size={18} /><span>Não conectamos bancos nem movimentamos seu dinheiro.</span></div>
      </div>

      <div className="login-card">
        <span className="login-lock"><LockKeyhole size={19} /></span>
        {step === "email" ? <>
          <span className="eyebrow">BEM-VINDO(A) DE VOLTA</span>
          <h2>Entre na sua conta</h2>
          <p className="login-card-copy">Informe seu e-mail para escolher como continuar.</p>

          <form onSubmit={continueWithEmail}>
            <label className="login-label" htmlFor="login-email">Seu e-mail</label>
            <input id="login-email" className="login-input" type="email" autoComplete="email" inputMode="email" placeholder="voce@exemplo.com" value={email} onChange={event => setEmail(event.target.value)} required />
            <button className="button primary login-submit" type="submit">Continuar com e-mail <ArrowRight size={17} /></button>
          </form>
          <button className="button secondary login-provider-button" type="button" onClick={continueToMicrosoft}>Entrar com Microsoft</button>
          <button className="button google-login-button" type="button" onClick={continueWithGoogle}>
            <GoogleMark /> Entrar com Google
          </button>
          <p className="login-password-note">Ao usar a Microsoft, sua senha será solicitada em uma página segura. A IA Financeira não recebe nem armazena sua senha.</p>
        </> : <>
          <button className="text-link login-step-back" type="button" onClick={backToEmail}><ArrowLeft size={15} /> Voltar</button>
          <span className="eyebrow">CRIAR ACESSO</span>
          <h2>Crie sua senha</h2>
          <p className="login-card-copy">Para o e-mail <strong>{email}</strong>. Use pelo menos 12 caracteres.</p>
          <form onSubmit={createPreviewPassword}>
            <label className="login-label" htmlFor="new-password">Senha</label>
            <input id="new-password" className="login-input" type="password" autoComplete="new-password" minLength={12} placeholder="Mínimo de 12 caracteres" value={password} onChange={event => setPassword(event.target.value)} required />
            <label className="login-label" htmlFor="confirm-password">Confirme a senha</label>
            <input id="confirm-password" className="login-input" type="password" autoComplete="new-password" minLength={12} placeholder="Digite a senha novamente" value={passwordConfirmation} onChange={event => setPasswordConfirmation(event.target.value)} required />
            <button className="button primary login-submit" type="submit">Criar senha <ArrowRight size={17} /></button>
          </form>
        </>}
        {message && <p className="notice warning login-message" role="status">{message}</p>}

        <div className="login-preview">
          <span className="login-divider"><span>OU</span></span>
          <p>Quer conhecer os recursos primeiro?</p>
          <a className="button secondary login-preview-button" href="/?mode=demo">Acessar demonstração</a>
          <small>Os exemplos são fictícios e ficam salvos somente neste navegador.</small>
        </div>
      </div>
    </section>
    <footer className="login-footer"><span>IA Financeira</span><span>Organização financeira e educação, no seu ritmo.</span></footer>
  </main>;
}

function GoogleMark() {
  return <svg className="google-mark" aria-hidden="true" viewBox="0 0 48 48" focusable="false">
    <path fill="#4285F4" d="M43.6 24.5c0-1.4-.1-2.7-.4-4H24v7.6h11c-.5 2.5-1.9 4.6-4 6v5h6.5c3.8-3.5 6.1-8.6 6.1-14.6z" />
    <path fill="#34A853" d="M24 44c5.5 0 10.1-1.8 13.5-4.9l-6.5-5c-1.8 1.2-4 1.9-7 1.9-5.4 0-10-3.6-11.7-8.5H5.6v5.2C9 39.4 16 44 24 44z" />
    <path fill="#FBBC05" d="M12.3 27.5c-.4-1.1-.7-2.3-.7-3.5s.2-2.4.7-3.5v-5.2H5.6A20 20 0 0 0 3.5 24c0 3.2.8 6.3 2.1 8.9z" />
    <path fill="#EA4335" d="M24 12c3 0 5.6 1 7.6 3l5.7-5.7C33.9 5.9 29.5 4 24 4 16 4 9 8.6 5.6 15.3l6.7 5.2C14 15.6 18.6 12 24 12z" />
  </svg>;
}
