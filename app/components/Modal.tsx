"use client";

import type { ReactNode } from "react";

interface ModalProps {
  open: boolean;
  title: string;
  description?: string;
  children?: ReactNode;
  primaryLabel?: string;
  primaryDanger?: boolean;
  onPrimary?: () => void;
  onClose: () => void;
}

export function Modal({
  open,
  title,
  description,
  children,
  primaryLabel,
  primaryDanger = false,
  onPrimary,
  onClose,
}: ModalProps) {
  if (!open) return null;
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="modal-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="modal-grabber" />
        <h2 id="modal-title">{title}</h2>
        {description ? <p className="modal-description">{description}</p> : null}
        {children ? <div className="modal-content">{children}</div> : null}
        <div className="modal-actions">
          <button className="button button-secondary" type="button" onClick={onClose}>
            取消
          </button>
          {primaryLabel ? (
            <button
              className={`button ${primaryDanger ? "button-danger" : "button-primary"}`}
              type="button"
              onClick={onPrimary}
            >
              {primaryLabel}
            </button>
          ) : null}
        </div>
      </section>
    </div>
  );
}
