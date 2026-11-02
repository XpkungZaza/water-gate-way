"use client";

import { useActionState } from "react";
import { CircleAlert } from "lucide-react";
import { signIn } from "./actions";
import PasswordField from "@/components/PasswordField";

const MESSAGES = {
  invalid: "อีเมลหรือรหัสผ่านไม่ถูกต้อง",
  rate_limited: "พยายามบ่อยเกินไป ลองอีกครั้งภายหลัง",
} as const;

export default function LoginForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState(signIn, undefined);
  const error = state?.error ? MESSAGES[state.error] : null;

  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="next" value={next} />
      <div className="space-y-1.5">
        <label htmlFor="email" className="block text-sm font-bold text-fg">
          อีเมล
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          inputMode="email"
          autoCapitalize="none"
          spellCheck={false}
          required
          className="input-field w-full"
        />
      </div>
      <div className="space-y-1.5">
        <PasswordField
          id="password"
          name="password"
          label="รหัสผ่าน"
          autoComplete="current-password"
          required
        />
      </div>
      <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm text-fg">
        <input type="checkbox" name="remember" id="remember" className="size-4 accent-fg" /> จดจำฉันไว้ในอุปกรณ์นี้ 30 วัน
      </label>
      {error && (
        <p key={error} role="alert" className="anim-rise-in flex items-center gap-2 text-sm font-bold text-danger">
          <CircleAlert className="size-4 shrink-0" strokeWidth={1.75} aria-hidden="true" />
          {error}
        </p>
      )}
      <button type="submit" disabled={pending} aria-busy={pending} className="btn-primary w-full">
        {pending ? "กำลังเข้าสู่ระบบ…" : "เข้าสู่ระบบ"}
      </button>
    </form>
  );
}
