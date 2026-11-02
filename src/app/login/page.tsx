import type { Metadata } from "next";
import { BrandMark } from "@/components/AppHeader";
import LoginForm from "./LoginForm";

export const metadata: Metadata = { title: "เข้าสู่ระบบ · Water Gate Way" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { next } = await searchParams;
  // safeNext() in the action validates this; here it is only passed through.
  return (
    <main className="flex min-h-dvh items-center justify-center bg-bg px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="flex items-center gap-3">
          <BrandMark className="size-10" />
          <div>
            <h1 className="text-2xl font-bold text-fg">Water Gate Way</h1>
            <p className="text-sm text-muted">ระดับน้ำ ปั๊ม และกล้องของประตูน้ำ</p>
          </div>
        </div>
        <div className="mt-6 rounded-lg border border-border bg-surface p-6">
          <h2 className="mb-5 text-base font-bold text-fg">เข้าสู่ระบบ</h2>
          <LoginForm next={typeof next === "string" ? next : ""} />
        </div>
        <p className="mt-4 text-sm text-muted">ยังไม่มีบัญชี ติดต่อผู้ดูแลระบบเพื่อขอสิทธิ์</p>
      </div>
    </main>
  );
}
