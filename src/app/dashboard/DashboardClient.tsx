"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import AppHeader from "@/components/AppHeader";
import { useGateStatus } from "@/hooks/useGateStatus";
import { isStale } from "@/lib/telemetry/stale";
import type { Gate } from "@/lib/gates";
import type { SessionUser } from "@/lib/auth/session";
import CameraGrid from "./_components/CameraGrid";
import ElectricCard from "./_components/ElectricCard";
import FloatSwitchCard from "./_components/FloatSwitchCard";
import WireBreakCard from "./_components/WireBreakCard";
import WaterLevelChart from "./_components/WaterLevelChart";
import DetectionCard from "./_components/DetectionCard";
import ControlPanel from "./_components/ControlPanel";
import LevelGauge, { formatReceived } from "./_components/LevelGauge";
import StatePill from "@/components/StatePill";

type Props = { gate: Gate; role: SessionUser["role"] };

/** Wall-clock ms, ticking every second; null until mounted (avoids a server/client clock mismatch). */
function useNow(): number | null {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);
  return now;
}

function Shell({ isAdmin, children }: { isAdmin: boolean; children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-bg">
      <AppHeader active={null} isAdmin={isAdmin} />
      <main className="mx-auto w-full max-w-[1376px] flex-1 px-4 pt-6 pb-12 sm:px-6 lg:px-8">{children}</main>
    </div>
  );
}

/** Title row: the gate is the h1; under it, the link state and when the device last reported.
 *  WHY: the time is the telemetry's own receivedAt, never the wall clock, so a dead feed cannot look fresh. */
function TitleRow({ gate, stale, receivedAt }: { gate: Gate; stale: boolean; receivedAt: string | null }) {
  const received = formatReceived(receivedAt);
  return (
    <div className="mb-6">
      <h1 className="text-2xl font-bold text-fg">{gate.name}</h1>
      <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
        {stale ? <StatePill tone="danger">ขาดการเชื่อมต่อ</StatePill> : <StatePill tone="on">ออนไลน์</StatePill>}
        <span className="tabular-nums">
          {received ? `อุปกรณ์รายงานล่าสุด ${received}` : "ยังไม่ได้รับข้อมูลจากอุปกรณ์"}
        </span>
      </p>
    </div>
  );
}

function LiveDashboard({ gate, role }: Props) {
  const now = useNow();
  const { status, conn } = useGateStatus();
  const stale = now === null || isStale(status, conn, now);
  const live = !stale;

  return (
    <Shell isAdmin={role === "admin"}>
      <TitleRow gate={gate} stale={stale} receivedAt={status?.receivedAt ?? null} />

      {/* One grid. Desktop: main column + a 384px control rail spanning the first three rows.
          Phone order: water level → controls → readings → cameras (the level is the screen's question). */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_384px]">
        <section
          aria-labelledby="water-level-heading"
          className="min-w-0 rounded-lg border border-border bg-surface p-4 sm:p-5"
        >
          <h2 id="water-level-heading" className="mb-4 text-base font-bold text-fg">
            ระดับน้ำ
          </h2>
          <div className="grid grid-cols-1 gap-8 md:grid-cols-[auto_minmax(0,1fr)]">
            <LevelGauge
              liquid={status?.radar.liquid ?? null}
              airGap={status?.radar.airGap ?? null}
              live={live}
              receivedAt={status?.receivedAt ?? null}
            />
            <WaterLevelChart />
          </div>
        </section>

        {/* Viewer gets the same panel read-only: state is job #1 for every role. */}
        <aside className="min-w-0 lg:col-start-2 lg:row-span-3 lg:row-start-1">
          <div className="lg:sticky lg:top-6">
            <ControlPanel devices={status?.devices ?? null} stale={stale} readOnly={role === "viewer"} />
          </div>
        </aside>

        <section
          id="sensor-grid"
          aria-labelledby="readings-heading"
          className="min-w-0 rounded-lg border border-border bg-surface p-4 sm:p-5"
        >
          <h2 id="readings-heading" className="mb-4 text-base font-bold text-fg">
            ค่าที่วัดได้
          </h2>
          {/* WHY: two columns, not four: at the rail's side four columns broke the Thai labels mid-word. */}
          <div className="grid grid-cols-1 gap-x-10 gap-y-6 sm:grid-cols-2">
            <ElectricCard pzem={status?.pzem ?? null} live={live} />
            <FloatSwitchCard float={status?.float ?? null} live={live} />
            <WireBreakCard wireBreak={status?.wireBreak ?? null} live={live} />
            <DetectionCard personCount={status?.personCount ?? null} live={live} />
          </div>
        </section>

        <div className="min-w-0">
          <CameraGrid />
        </div>
      </div>
    </Shell>
  );
}

function NoDevice({ gate, role }: { gate: Gate; role: SessionUser["role"] }) {
  return (
    <Shell isAdmin={role === "admin"}>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-fg">{gate.name}</h1>
        <p className="mt-2 flex items-center gap-3 text-sm text-muted">
          <StatePill tone="off">ยังไม่ติดตั้งอุปกรณ์</StatePill>
          <span className="tabular-nums">
            พิกัด {gate.lat.toFixed(4)}, {gate.lng.toFixed(4)}
          </span>
        </p>
      </div>
      <section className="max-w-2xl rounded-lg border border-border bg-surface p-5">
        <h2 className="text-base font-bold text-fg">ประตูนี้ยังไม่มีเซนเซอร์หรือกล้อง</h2>
        <p className="mt-2 text-sm text-fg">
          เมื่อติดตั้งบอร์ด STM32 และกล้องแล้ว ผู้ดูแลระบบเปิด &ldquo;มีอุปกรณ์&rdquo; ในหน้าจัดการประตูน้ำ
          หน้านี้จะแสดงระดับน้ำ ปุ่มควบคุม และกล้องสด
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          <Link href="/" className="btn-secondary">
            กลับไปแผนที่
          </Link>
          {role === "admin" && (
            <Link href="/admin/gates" className="btn-secondary">
              จัดการประตูน้ำ
            </Link>
          )}
        </div>
      </section>
    </Shell>
  );
}

export default function DashboardClient({ gate, role }: Props) {
  // WHY: gates without hardware never open the telemetry stream or camera sessions.
  return gate.hasDevice ? <LiveDashboard gate={gate} role={role} /> : <NoDevice gate={gate} role={role} />;
}
