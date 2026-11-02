import type { Metadata } from "next";
import Link from "next/link";
import { Wordmark } from "@/components/AppHeader";
import LoginForm from "./LoginForm";

export const metadata: Metadata = { title: "เข้าสู่ระบบ · Water Gate Way" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { next, registered } = await searchParams;
  // safeNext() in the action validates this; here it is only passed through.
  return (
    <main className="flex min-h-dvh items-center justify-center bg-bg px-4 py-10">
      <div className="w-full max-w-sm">
        <h1>
          <Wordmark />
        </h1>
        <p className="mt-2 text-sm text-muted">ระดับน้ำ ปั๊ม และกล้องของประตูน้ำ</p>
        <div className="mt-6 rounded-lg border border-border bg-surface p-6">
          <h2 className="mb-5 text-base font-bold text-fg">เข้าสู่ระบบ</h2>
          {/* WHY: the same notice for a new account and an existing email, so it reveals nothing. */}
          {registered === "1" && (
            <p role="status" className="mb-5 rounded-md bg-on-soft px-3 py-2 text-sm text-on">
              ถ้าอีเมลนี้ยังไม่เคยมีบัญชี บัญชีของคุณพร้อมใช้แล้ว เข้าสู่ระบบด้วยรหัสผ่านที่เพิ่งตั้ง
              ถ้ามีบัญชีอยู่แล้ว ใช้รหัสผ่านเดิม
            </p>
          )}
          <LoginForm next={typeof next === "string" ? next : ""} />
        </div>
        <p className="mt-4 text-sm text-muted">
          ยังไม่มีบัญชี{" "}
          <Link href="/register" className="font-bold text-fg underline underline-offset-2 hover:no-underline">
            สมัครใช้งาน
          </Link>
        </p>
      </div>
    </main>
  );
}
