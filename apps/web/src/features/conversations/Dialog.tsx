import { useEffect, useRef } from "preact/hooks";
import type { ComponentChildren } from "preact";
import styles from "./Conversations.module.css";

/**
 * Modale accessible basée sur <dialog> : focus piégé par le navigateur, Échap pour fermer,
 * titre relié par aria-labelledby.
 */
export function Dialog({ title, onClose, children }: { title: string; onClose: () => void; children: ComponentChildren }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);
  const titleId = `dialog-${title.replace(/\W+/g, "-").toLowerCase()}`;
  return (
    <dialog
      ref={ref}
      class={styles.dialog}
      aria-labelledby={titleId}
      onClose={onClose}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <header class={styles.dialogHeader}>
        <h2 id={titleId} class={styles.dialogTitle}>
          {title}
        </h2>
        <button type="button" class={styles.close} aria-label="Fermer" onClick={onClose}>
          ×
        </button>
      </header>
      {children}
    </dialog>
  );
}
