import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { Check, Close } from './icons';
import { copyText } from '../lib/hooks';

/* ------------------------------------------------------------------ */
/* Modal                                                               */
/* ------------------------------------------------------------------ */

export function Modal({
  title,
  subtitle,
  onClose,
  children,
  footer,
  tabs,
  wide,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  tabs?: ReactNode;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
      }
    };
    document.addEventListener('keydown', onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    ref.current?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
    };
  }, [onClose]);

  const node = (
    <div
      className="overlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className={`modal${wide ? ' wide' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        ref={ref}
      >
        <div className="modal-head">
          <div>
            <h2>{title}</h2>
            {subtitle ? <p className="small muted" style={{ marginTop: 2 }}>{subtitle}</p> : null}
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            <Close />
          </button>
        </div>
        {tabs}
        <div className="modal-body">{children}</div>
        {footer ? <div className="modal-foot">{footer}</div> : null}
      </div>
    </div>
  );

  return createPortal(node, document.body);
}

/* ------------------------------------------------------------------ */
/* Segmented control                                                   */
/* ------------------------------------------------------------------ */

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: { value: T; label: ReactNode; title?: string }[];
  onChange: (value: T) => void;
  label?: string;
}) {
  return (
    <div className="segmented" role="group" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={value === option.value}
          title={option.title}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Settings rows                                                       */
/* ------------------------------------------------------------------ */

export function SwitchRow({
  label,
  desc,
  checked,
  onChange,
}: {
  label: string;
  desc?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div className="setting">
      <span>
        <span className="name">{label}</span>
        {desc ? <span className="desc" style={{ display: 'block' }}>{desc}</span> : null}
      </span>
      <label className="switch">
        <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
        <span />
      </label>
    </div>
  );
}

export function NumberRow({
  label,
  desc,
  value,
  min,
  max,
  suffix = 'min',
  onChange,
}: {
  label: string;
  desc?: string;
  value: number;
  min: number;
  max: number;
  suffix?: string;
  onChange: (value: number) => void;
}) {
  return (
    <div className="setting">
      <span>
        <span className="name">{label}</span>
        {desc ? <span className="desc" style={{ display: 'block' }}>{desc}</span> : null}
      </span>
      <span className="row" style={{ gap: 6 }}>
        <input
          className="field sm num"
          type="number"
          min={min}
          max={max}
          value={value}
          onChange={(event) => {
            const next = Number(event.target.value);
            if (!Number.isFinite(next)) return;
            onChange(Math.max(min, Math.min(max, Math.round(next))));
          }}
        />
        <span className="small muted">{suffix}</span>
      </span>
    </div>
  );
}

export function RangeRow({
  label,
  value,
  onChange,
  min = 0,
  max = 100,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
}) {
  return (
    <div className="setting">
      <span className="name">{label}</span>
      <span className="row" style={{ gap: 10, minWidth: 170 }}>
        <input
          type="range"
          min={min}
          max={max}
          value={value}
          onChange={(event) => onChange(Number(event.target.value))}
        />
        <span className="small muted num" style={{ width: 34, textAlign: 'right' }}>
          {value}
        </span>
      </span>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Status + copy                                                       */
/* ------------------------------------------------------------------ */

const STATUS_TEXT: Record<string, string> = {
  live: 'Live',
  connecting: 'Connecting',
  offline: 'Offline',
  error: 'Sync paused',
};

export function StatusPill({ status, detail }: { status: string; detail?: string }) {
  return (
    <span className="chip" title={detail ?? STATUS_TEXT[status] ?? status}>
      <span className={`dot ${status}`} />
      {STATUS_TEXT[status] ?? status}
    </span>
  );
}

export function CopyChip({
  value,
  label,
  onCopied,
  mono = true,
}: {
  value: string;
  label?: string;
  onCopied?: (ok: boolean) => void;
  mono?: boolean;
}) {
  const [done, setDone] = useState(false);
  const text = label ?? value;
  return (
    <button
      type="button"
      className={`chip${mono ? ' mono' : ''}`}
      onClick={async () => {
        const ok = await copyText(value);
        setDone(ok);
        onCopied?.(ok);
        window.setTimeout(() => setDone(false), 1400);
      }}
      title="Click to copy"
    >
      {done ? 'Copied' : text}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* Ring                                                                */
/* ------------------------------------------------------------------ */

export function Ring({ progress, children }: { progress: number; children?: ReactNode }) {
  const radius = 92;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.min(1, Math.max(0, progress));
  const ticks = useMemo(
    () =>
      Array.from({ length: 60 }, (_, i) => {
        const angle = (i / 60) * Math.PI * 2;
        const major = i % 5 === 0;
        const inner = radius + (major ? 4 : 6);
        const outer = radius + 9;
        return {
          key: i,
          x1: 100 + Math.cos(angle) * inner,
          y1: 100 + Math.sin(angle) * inner,
          x2: 100 + Math.cos(angle) * outer,
          y2: 100 + Math.sin(angle) * outer,
        };
      }),
    [],
  );

  return (
    <div className="ring">
      <svg viewBox="0 0 200 200" aria-hidden="true">
        <g>
          {ticks.map((tick) => (
            <line key={tick.key} className="ticks" x1={tick.x1} y1={tick.y1} x2={tick.x2} y2={tick.y2} />
          ))}
        </g>
        <circle className="track" cx="100" cy="100" r={radius} />
        <circle
          className="arc"
          cx="100"
          cy="100"
          r={radius}
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - clamped)}
        />
      </svg>
      <div className="ring-inner">{children}</div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Toasts                                                              */
/* ------------------------------------------------------------------ */

const ToastContext = createContext<(message: string) => void>(() => undefined);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [message, setMessage] = useState<string | null>(null);
  const timer = useRef<number | null>(null);

  const push = useCallback((next: string) => {
    setMessage(next);
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setMessage(null), 2600);
  }, []);

  return (
    <ToastContext.Provider value={push}>
      {children}
      {message ? <div className="toast">{message}</div> : null}
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);

/* ------------------------------------------------------------------ */
/* Misc                                                                */
/* ------------------------------------------------------------------ */

export function ConfirmDialog({
  title,
  body,
  confirmLabel,
  onConfirm,
  onClose,
}: {
  title: string;
  body: string;
  confirmLabel: string;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <Modal
      title={title}
      onClose={onClose}
      footer={
        <>
          <button className="btn quiet" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn danger"
            onClick={() => {
              onConfirm();
              onClose();
            }}
          >
            <Check size={15} />
            {confirmLabel}
          </button>
        </>
      }
    >
      <p className="lead">{body}</p>
    </Modal>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="empty-state">{children}</p>;
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label style={{ display: 'block' }}>
      <span className="label" style={{ display: 'block', marginBottom: 6 }}>
        {label}
      </span>
      {children}
      {hint ? (
        <span className="tiny muted" style={{ display: 'block', marginTop: 5 }}>
          {hint}
        </span>
      ) : null}
    </label>
  );
}
