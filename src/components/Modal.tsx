"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { CircleAlert, Info, TriangleAlert } from "lucide-react";

type Tone = "danger" | "warn" | "info";

type Props = {
  open: boolean;
  /** Called on Esc, a click on the backdrop and the close button. The caller sets `open` to false. */
  onClose: () => void;
  title: string;
  tone?: Tone;
  children?: ReactNode;
  /** With `confirm` the dialog is a question: [close | confirm]. Without it, it is a notice: [close]. */
  confirm?: { label: string; onConfirm: () => void };
  /** Label of the close button. Default: "ตกลง" for a notice, "ยกเลิก" for a question. */
  closeLabel?: string;
};

const TONE = {
  danger: { Icon: CircleAlert, chip: "bg-danger-soft text-danger", solid: "bg-danger text-white hover:bg-danger/90" },
  warn: { Icon: TriangleAlert, chip: "bg-warn-soft text-warn", solid: "bg-warn text-white hover:bg-warn/90" },
  info: { Icon: Info, chip: "bg-tint-blue text-accent", solid: "bg-brand text-white hover:bg-brand/90" },
} as const;

/**
 * The one modal for the whole app (notices, errors and confirmations), on the native <dialog>:
 * showModal() gives the focus trap, inert page behind it, Esc and the top layer for free.
 * Entrance is CSS only (globals.css `dialog.modal`): 180 ms fade + 4% scale, opacity only under reduced motion.
 * WHY the safe button has autoFocus: Enter must never confirm a destructive question by accident.
 */
export default function Modal({ open, onClose, title, tone = "info", children, confirm, closeLabel }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const openRef = useRef(open);

  // Runs before the open/close effect below, so a close we trigger ourselves is already marked as not user-caused.
  useEffect(() => {
    openRef.current = open;
  });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  const { Icon, chip, solid } = TONE[tone];
  // WHY useId: the admin table renders one modal per row; ids built from the title would collide.
  const titleId = useId();

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      // `close` also fires for our own el.close(); only report a close the user caused.
      onClose={() => {
        if (openRef.current) onClose();
      }}
      // A click on the dialog box itself (outside the inner panel) is a click on the backdrop.
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="modal m-auto w-[min(26rem,calc(100vw-2rem))] rounded-2xl bg-surface p-0 text-fg shadow-xl backdrop:bg-brand/50"
    >
      <div className="p-5 sm:p-6">
        <div className="flex items-start gap-3">
          <span className={`grid size-10 shrink-0 place-items-center rounded-xl ${chip}`}>
            <Icon className="size-5" strokeWidth={1.75} aria-hidden="true" />
          </span>
          <div className="min-w-0 pt-0.5">
            <h2 id={titleId} className="text-base font-bold">
              {title}
            </h2>
            {children && <div className="mt-1.5 text-sm text-muted">{children}</div>}
          </div>
        </div>

        <div className={`mt-5 grid gap-2 ${confirm ? "grid-cols-2" : "grid-cols-1"}`}>
          <button type="button" autoFocus className="btn-secondary" onClick={onClose}>
            {closeLabel ?? (confirm ? "ยกเลิก" : "ตกลง")}
          </button>
          {confirm && (
            <button type="button" className={`btn ${solid} active:translate-y-px`} onClick={confirm.onConfirm}>
              {confirm.label}
            </button>
          )}
        </div>
      </div>
    </dialog>
  );
}
