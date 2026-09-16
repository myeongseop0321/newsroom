"use client";

import { FormEvent, useState } from "react";
import { ArrowRight, LoaderCircle } from "lucide-react";

export default function LoginForm({ returnTo }: { returnTo: string }) {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const form = new FormData(event.currentTarget);
    const displayName = String(form.get("displayName") ?? "");
    const email = String(form.get("email") ?? "");
    const password = String(form.get("password") ?? "");
    try {
      let passwordSalt:string,iterations:number;
      if(mode==="signup"){
        passwordSalt=base64Url(crypto.getRandomValues(new Uint8Array(16)));iterations=100_000;
      }else{
        const challenge=await fetch(`/api/auth/challenge?email=${encodeURIComponent(email)}`,{cache:"no-store"});
        if(!challenge.ok)throw new Error("로그인 준비 중 문제가 발생했습니다.");
        ({salt:passwordSalt,iterations}=await challenge.json() as {salt:string;iterations:number});
      }
      const passwordVerifier=await derivePassword(password,passwordSalt,iterations);
      const payload=mode==="signup"?{displayName,email,passwordVerifier,passwordSalt}:{email,passwordVerifier};
      const response = await fetch(`/api/auth/${mode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error || "요청을 처리하지 못했습니다.");
      window.location.assign(returnTo);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "잠시 후 다시 시도해 주세요.");
      setBusy(false);
    }
  }

  return (
    <main className="auth-shell">
      <a href="/" className="auth-brand" aria-label="PRESSROOM 홈">
        PRESS<span>ROOM</span><i />
      </a>
      <section className="auth-card">
        <p className="auth-eyebrow">MY NEWS DESK</p>
        <h1>{mode === "login" ? "다시 만나 반가워요" : "나만의 뉴스룸을 시작해요"}</h1>
        <p className="auth-description">
          {mode === "login"
            ? "저장한 언론사와 스크랩을 이어서 확인하세요."
            : "가입하면 언론사 설정과 기사 스크랩이 안전하게 저장됩니다."}
        </p>
        <form className="auth-form" onSubmit={submit}>
          {mode === "signup" && (
            <label>
              이름
              <input name="displayName" required maxLength={40} autoComplete="name" placeholder="홍길동" />
            </label>
          )}
          <label>
            이메일
            <input name="email" required type="email" autoComplete="email" placeholder="news@example.com" />
          </label>
          <label>
            비밀번호
            <input
              name="password"
              required
              type="password"
              minLength={8}
              maxLength={128}
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              placeholder="8자 이상 입력해 주세요"
            />
          </label>
          {error && <p className="auth-error" role="alert">{error}</p>}
          <button className="auth-submit" disabled={busy} type="submit">
            {busy ? <LoaderCircle className="spin" size={18} /> : <ArrowRight size={18} />}
            {mode === "login" ? "로그인" : "회원가입"}
          </button>
        </form>
        <button
          className="auth-switch"
          type="button"
          onClick={() => {
            setMode((current) => (current === "login" ? "signup" : "login"));
            setError("");
          }}
        >
          {mode === "login" ? "처음이신가요? 회원가입" : "이미 계정이 있나요? 로그인"}
        </button>
      </section>
    </main>
  );
}

async function derivePassword(password:string,salt:string,iterations:number){
  const key=await crypto.subtle.importKey("raw",new TextEncoder().encode(password),"PBKDF2",false,["deriveBits"]);
  const bits=await crypto.subtle.deriveBits({name:"PBKDF2",hash:"SHA-256",salt:base64UrlDecode(salt),iterations},key,256);
  return base64Url(new Uint8Array(bits));
}
const base64Url=(bytes:Uint8Array)=>{let value="";for(const byte of bytes)value+=String.fromCharCode(byte);return btoa(value).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/g,"");};
const base64UrlDecode=(value:string)=>{const binary=atob(value.replace(/-/g,"+").replace(/_/g,"/").padEnd(Math.ceil(value.length/4)*4,"="));return Uint8Array.from(binary,char=>char.charCodeAt(0));};
