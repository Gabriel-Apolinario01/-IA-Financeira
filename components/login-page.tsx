"use client";
import Link from "next/link";
import { useState, type FormEvent } from "react";
import { ArrowLeft, ArrowRight, Check, LockKeyhole, ShieldCheck, Sprout } from "lucide-react";

export default function LoginPage({ emailEnabled, microsoftEnabled }: { emailEnabled: boolean; microsoftEnabled: boolean }) {
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setMessage("");
    if (creating && password !== confirmation) { setMessage("As senhas não coincidem."); return; }
    setPending(true);
    try {
      const response = await fetch(`/api/auth/${creating ? 'sign-up' : 'sign-in'}/email`, {
        method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), password, ...(creating ? { name: name.trim() } : {}) }),
      });
      if (!response.ok) {
        setMessage(response.status === 429 ? "Muitas tentativas. Aguarde alguns minutos antes de tentar novamente."
          : response.status >= 500 ? "O acesso está indisponível no momento. Tente novamente mais tarde."
          : creating ? "Não foi possível criar o acesso. Confira os dados; se já possui uma conta, use Entrar."
          : "E-mail ou senha inválidos. Confira os dados e tente novamente.");
        return;
      }
      setPassword(""); setConfirmation("");
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- Request a fresh document with the session cookie.
      window.location.assign('/?mode=account');
    } catch { setMessage("Não foi possível conectar. Confira sua conexão e tente novamente."); }
    finally { setPending(false); }
  }

  return <main className="login-page">
    <header className="login-nav">
      <Link href="/" prefetch={false} className="login-brand" aria-label="IA Financeira, início"><span className="brand-mark"><Sprout size={23} strokeWidth={1.8} /></span><span>IA<span className="brand-light">Financeira</span></span></Link>
      <Link href="/" prefetch={false} className="text-link"><ArrowLeft size={16} /> Página inicial</Link>
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
        <span className="eyebrow">{creating ? "SEU PRIMEIRO PASSO" : "BEM-VINDO(A) DE VOLTA"}</span>
        <h2>{creating ? "Crie sua conta" : "Entre na sua conta"}</h2>
        {emailEnabled ? <>
          <p className="login-card-copy">{creating ? "Cadastre seu e-mail e uma senha com pelo menos 12 caracteres." : "Acesse os registros salvos na sua conta."}</p>
          <form onSubmit={submit} aria-busy={pending}>
            {creating && <><label className="login-label" htmlFor="login-name">Seu nome</label><input id="login-name" className="login-input" autoComplete="name" maxLength={80} value={name} onChange={e => setName(e.target.value)} required disabled={pending} /></>}
            <label className="login-label" htmlFor="login-email">Seu e-mail</label>
            <input id="login-email" className="login-input" type="email" autoComplete="email" inputMode="email" maxLength={254} placeholder="voce@exemplo.com" value={email} onChange={e => setEmail(e.target.value)} required disabled={pending} />
            <label className="login-label" htmlFor="login-password">Senha</label>
            <input id="login-password" className="login-input" type="password" autoComplete={creating ? 'new-password' : 'current-password'} minLength={creating ? 12 : 1} maxLength={128} value={password} onChange={e => setPassword(e.target.value)} required disabled={pending} />
            {creating && <><label className="login-label" htmlFor="login-confirmation">Confirme a senha</label><input id="login-confirmation" className="login-input" type="password" autoComplete="new-password" minLength={12} maxLength={128} value={confirmation} onChange={e => setConfirmation(e.target.value)} required disabled={pending} /></>}
            <button className="button primary login-submit" type="submit" disabled={pending}>{pending ? "Aguarde…" : creating ? "Criar conta" : "Entrar"}<ArrowRight size={17} /></button>
          </form>
          <button className="button secondary login-provider-button" type="button" disabled={pending} onClick={() => { setCreating(!creating); setMessage(''); setPassword(''); setConfirmation(''); }}>{creating ? "Já tenho conta — entrar" : "Ainda não tenho conta — cadastrar"}</button>
          {creating && <p className="fine-print">Guarde sua senha em um gerenciador. A recuperação por e-mail ainda não está disponível.</p>}
        </> : <p className="login-card-copy">{microsoftEnabled ? 'Continue com sua conta Microsoft.' : 'O acesso por conta está em configuração. A demonstração continua disponível.'}</p>}
        {microsoftEnabled && <a className="button secondary login-provider-button" href="/.auth/login/aad?post_login_redirect_uri=%2F%3Fmode%3Daccount">Entrar com Microsoft</a>}
        {message && <p className="notice warning login-message" role="alert">{message}</p>}
        <div className="login-preview"><span className="login-divider"><span>OU</span></span><p>Quer conhecer os recursos primeiro?</p><Link className="button secondary login-preview-button" href="/?mode=demo" prefetch={false}>Acessar demonstração</Link><small>Os exemplos são fictícios e ficam salvos somente neste navegador.</small></div>
      </div>
    </section>
    <footer className="login-footer"><span>IA Financeira</span><span>Organização financeira e educação, no seu ritmo.</span></footer>
  </main>;
}
