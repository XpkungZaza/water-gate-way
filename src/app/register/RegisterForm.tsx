"use client";

import { useActionState, useState } from "react";
import { CircleAlert } from "lucide-react";
import { register, type RegisterState } from "./actions";

function message(state: RegisterState): string | null {
  switch (state?.error) {
    case "email":
      return "รูปแบบอีเมลไม่ถูกต้อง";
    case "password":
      return "รหัสผ่านต้องมี 8 ถึง 1024 ตัวอักษร";
    case "mismatch":
      return "รหัสผ่านทั้งสองช่องไม่ตรงกัน";
    case "rate_limited":
      return `สมัครบ่อยเกินไป ลองอีกครั้งใน ${Math.ceil((state.retryAfterSec ?? 60) / 60)} นาที`;
    default:
      return null;
  }
}

export default function RegisterForm() {
  const [state, action, pending] = useActionState(register, undefined);
  // WHY: controlled, so React's reset after the action leaves the email in place; the passwords clear.
  const [email, setEmail] = useState("");
  const error = message(state);

  return (
    <form action={action} className="space-y-5">
      <div className="space-y-1.5">
        <label htmlFor="email" className="block text-sm font-bold text-fg">
          อีเมล
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          maxLength={254}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          aria-invalid={state?.error === "email" || undefined}
          className="input-field w-full"
        />
      </div>
      <div className="space-y-1.5">
        <label htmlFor="password" className="block text-sm font-bold text-fg">
          รหัสผ่าน
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          maxLength={1024}
          aria-describedby="password-rule"
          aria-invalid={state?.error === "password" || undefined}
          className="input-field w-full"
        />
        <p id="password-rule" className="text-sm text-muted">
          อย่างน้อย 8 ตัวอักษร
        </p>
      </div>
      <div className="space-y-1.5">
        <label htmlFor="confirm" className="block text-sm font-bold text-fg">
          ยืนยันรหัสผ่าน
        </label>
        <input
          id="confirm"
          name="confirm"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          maxLength={1024}
          aria-invalid={state?.error === "mismatch" || undefined}
          className="input-field w-full"
        />
      </div>
      {error && (
        <p role="alert" className="flex items-center gap-2 text-sm font-bold text-danger">
          <CircleAlert className="size-4 shrink-0" strokeWidth={1.75} aria-hidden="true" />
          {error}
        </p>
      )}
      <button type="submit" disabled={pending} aria-busy={pending} className="btn-primary w-full">
        {pending ? "กำลังสมัคร…" : "สมัครใช้งาน"}
      </button>
    </form>
  );
}
