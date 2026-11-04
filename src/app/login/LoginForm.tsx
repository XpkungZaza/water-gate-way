"use client";

import { useActionState, useState } from "react";
import { signIn } from "./actions";
import PasswordField from "@/components/PasswordField";
import Modal from "@/components/Modal";

const MESSAGES = {
  invalid: "อีเมลหรือรหัสผ่านไม่ถูกต้อง",
  rate_limited: "พยายามบ่อยเกินไป ลองอีกครั้งภายหลัง",
} as const;

export default function LoginForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState(signIn, undefined);
  const error = state?.error ? MESSAGES[state.error] : null;
  // WHY: keyed to the state object, not the text, so the same error again after a dismiss reopens the modal.
  const [dismissed, setDismissed] = useState<unknown>(null);
  // WHY: controlled, so React's form reset after the action keeps the email (as in RegisterForm); only the password clears.
  const [email, setEmail] = useState("");

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
          value={email}
          onChange={(e) => setEmail(e.target.value)}
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
      <button type="submit" disabled={pending} aria-busy={pending} className="btn-primary w-full">
        {pending ? "กำลังเข้าสู่ระบบ…" : "เข้าสู่ระบบ"}
      </button>
      <Modal
        open={!!error && dismissed !== state}
        onClose={() => setDismissed(state)}
        title="เข้าสู่ระบบไม่สำเร็จ"
        tone="danger"
      >
        {error}
      </Modal>
    </form>
  );
}
