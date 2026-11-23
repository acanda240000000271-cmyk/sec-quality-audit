import React, { useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Flame,
  Lightbulb,
  ListOrdered,
  MessageSquareWarning,
  Thermometer,
  X,
} from 'lucide-react';
import type { BoardNote, HeatLevel, NoteType } from '../../shared/types';

export const NOTE_META: Record<
  NoteType,
  {
    label: string;
    bg: string;
    border: string;
    text: string;
    barColor: string;
    meaning: string;
  }
> = {
  Step: {
    label: 'Step',
    bg: '#E2E8F0',
    border: '#CBD5E1',
    text: '#1E293B',
    barColor: '#94A3B8',
    meaning: 'A main step in your weekly routine',
  },
  Difficulty: {
    label: 'Difficulty',
    bg: '#FDE68A',
    border: '#F59E0B',
    text: '#1E293B',
    barColor: '#F59E0B',
    meaning: 'Something that slows you down or makes work hard',
  },
  Complaint: {
    label: 'Complaint',
    bg: '#FECACA',
    border: '#F87171',
    text: '#7F1D1D',
    barColor: '#EF4444',
    meaning: 'What learners, parents, colleagues, or you raise',
  },
  Strength: {
    label: 'Strength',
    bg: '#BBF7D0',
    border: '#4ADE80',
    text: '#14532D',
    barColor: '#22C55E',
    meaning: 'A habit, tool, or practice that already works well',
  },
  Suggestion: {
    label: 'Suggestion',
    bg: '#BFDBFE',
    border: '#60A5FA',
    text: '#1E3A8A',
    barColor: '#3B82F6',
    meaning: 'A change or idea to make the routine smoother',
  },
};

export function NoteTypeIcon({
  type,
  className = 'w-4 h-4',
}: {
  type: NoteType;
  className?: string;
}) {
  switch (type) {
    case 'Step':
      return <ListOrdered className={className} aria-hidden="true" />;
    case 'Difficulty':
      return <AlertTriangle className={className} aria-hidden="true" />;
    case 'Complaint':
      return <MessageSquareWarning className={className} aria-hidden="true" />;
    case 'Strength':
      return <CheckCircle2 className={className} aria-hidden="true" />;
    case 'Suggestion':
      return <Lightbulb className={className} aria-hidden="true" />;
  }
}

export function HeatChip({ heat }: { heat: HeatLevel }) {
  const styles: Record<HeatLevel, { bg: string; color: string }> = {
    Hot: { bg: '#DC2626', color: '#FFFFFF' },
    Warm: { bg: '#EA580C', color: '#FFFFFF' },
    Mild: { bg: '#64748B', color: '#FFFFFF' },
  };
  const s = styles[heat] ?? styles.Mild;
  return (
    <span
      className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-xs font-semibold whitespace-nowrap shrink-0"
      style={{ backgroundColor: s.bg, color: s.color }}
    >
      {heat === 'Hot' ? (
        <Flame className="w-3.5 h-3.5" aria-hidden="true" />
      ) : (
        <Thermometer className="w-3.5 h-3.5" aria-hidden="true" />
      )}
      {heat}
    </span>
  );
}

export function StickyNoteCard({
  note,
  tiltIndex = 0,
  subtitle,
  onRemove,
}: {
  note: Pick<BoardNote, 'type' | 'text' | 'quote' | 'source' | 'code'>;
  tiltIndex?: number;
  subtitle?: string;
  onRemove?: () => void;
}) {
  const [showQuote, setShowQuote] = useState(false);
  const meta = NOTE_META[note.type] ?? NOTE_META.Difficulty;
  const tiltClass =
    tiltIndex % 3 === 0
      ? 'sticky-tilt-left'
      : tiltIndex % 3 === 1
      ? 'sticky-tilt-right'
      : 'sticky-tilt-slight';

  return (
    <div
      className={`sticky-note-card ${tiltClass} rounded-lg p-3.5 relative cursor-pointer select-text`}
      style={{
        backgroundColor: meta.bg,
        border: `1px solid ${meta.border}`,
        color: meta.text,
      }}
      onClick={() => {
        if (note.quote) setShowQuote((v) => !v);
      }}
      title={note.quote ? `Quote: "${note.quote}"` : undefined}
    >
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <div className="flex items-center gap-1.5 text-xs font-semibold">
          <NoteTypeIcon type={note.type} className="w-3.5 h-3.5 shrink-0" />
          <span>{meta.label}</span>
          {note.type === 'Complaint' && note.source ? (
            <span className="opacity-80">· {note.source}</span>
          ) : null}
          {note.code && note.code !== 'None' ? (
            <span className="opacity-80 font-mono">· {note.code}</span>
          ) : null}
        </div>
        {onRemove ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onRemove();
            }}
            aria-label="Remove note"
            className="w-6 h-6 rounded-full flex items-center justify-center hover:bg-black/10 transition-colors shrink-0"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        ) : null}
      </div>

      <p className="font-sticky text-[18px] leading-snug">{note.text}</p>

      {subtitle ? (
        <p className="mt-1.5 text-xs font-medium opacity-75">{subtitle}</p>
      ) : null}

      {note.quote ? (
        <div className="mt-2">
          <span className="text-[11px] font-medium underline decoration-dotted opacity-75">
            {showQuote ? 'Hide quote' : 'Tap for quote'}
          </span>
          {showQuote ? (
            <blockquote className="mt-1 text-xs italic bg-white/60 rounded p-2 border border-black/10">
              “{note.quote}”
            </blockquote>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  danger = false,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
    >
      <div className="sec-card max-w-md w-full p-6 fade-in-panel">
        <h3 id="confirm-dialog-title" className="text-lg font-bold text-slate-800">
          {title}
        </h3>
        <p className="mt-2 text-sm text-slate-600 leading-relaxed">{message}</p>
        <div className="mt-6 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 text-sm font-medium rounded-lg border border-[#EADFCB] text-slate-700 hover:bg-[#FBF7EF] transition-colors"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={`px-4 py-2 text-sm font-semibold rounded-lg transition-colors ${
              danger
                ? 'bg-red-600 text-white hover:bg-red-700'
                : 'bg-[#F59E0B] text-[#1E293B] hover:bg-[#D97706]'
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; message: string }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, message: error.message || 'An unexpected error occurred.' };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-[#FBF7EF] p-6">
          <div className="sec-card max-w-lg w-full p-6">
            <h2 className="text-lg font-bold text-slate-800">Something went wrong</h2>
            <p className="mt-2 text-sm text-slate-600 break-words">
              {this.state.message}
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="mt-4 px-4 py-2 text-sm font-semibold rounded-lg bg-[#F59E0B] text-[#1E293B] hover:bg-[#D97706]"
            >
              Reload page
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
