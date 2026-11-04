// WHY: getModifierState is only present on real key events and may be missing or
// throw in synthetic events / odd environments, so this must never crash the field.
export function isCapsLockOn(e: { getModifierState?: (key: "CapsLock") => boolean }): boolean {
  try {
    return e.getModifierState?.("CapsLock") === true;
  } catch {
    return false;
  }
}
