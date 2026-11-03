"use client";

import { useActionState, useRef, useState, type ReactNode } from "react";
import Modal from "@/components/Modal";
import type { AdminState } from "../actions";

type Action = (prev: AdminState, form: FormData) => Promise<AdminState>;

/** A form bound to a Server Action that shows the action's { error } in a modal (same pattern as LoginForm).
 *  `confirm` (when set) asks for confirmation in a modal before submitting; cancelling prevents the submit. */
export default function ActionForm({
  action,
  className,
  children,
  confirm,
}: {
  action: Action;
  className?: string;
  children: ReactNode;
  confirm?: string;
}) {
  const [state, formAction] = useActionState(action, undefined);
  const formRef = useRef<HTMLFormElement>(null);
  // WHY: set right before requestSubmit() so the onSubmit below lets exactly that one submit through.
  const confirmed = useRef(false);
  const [asking, setAsking] = useState(false);
  // WHY: keyed to the state object, not the text, so the same error again after a dismiss reopens the modal.
  const [dismissed, setDismissed] = useState<unknown>(null);

  return (
    <>
      <form
        ref={formRef}
        action={formAction}
        className={className}
        onSubmit={(e) => {
          if (!confirm) return;
          if (confirmed.current) {
            confirmed.current = false;
            return;
          }
          e.preventDefault();
          setAsking(true);
        }}
      >
        {children}
      </form>
      {confirm && (
        <Modal
          open={asking}
          onClose={() => setAsking(false)}
          title={confirm}
          tone="danger"
          confirm={{
            label: "ยืนยัน",
            onConfirm: () => {
              confirmed.current = true;
              formRef.current?.requestSubmit();
              setAsking(false);
            },
          }}
        />
      )}
      <Modal
        open={!!state?.error && dismissed !== state}
        onClose={() => setDismissed(state)}
        title="ดำเนินการไม่สำเร็จ"
        tone="danger"
      >
        {state?.error}
      </Modal>
    </>
  );
}
