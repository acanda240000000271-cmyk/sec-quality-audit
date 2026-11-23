import React, { useState } from 'react';
import {
  ArrowLeft,
  Check,
  Pencil,
  Plus,
  RefreshCw,
  Sparkles,
  Star,
  UserCheck,
  X,
} from 'lucide-react';
import {
  type AffinityBoard,
  COMPLAINT_SOURCES,
  type ComplaintSource,
  NOTE_TYPES,
  type NoteType,
  type ProfileSnapshot,
} from '../../shared/types';
import { formatDateShort, toTitleCaseFirstName } from '../lib/formatters';
import {
  ConfirmDialog,
  HeatChip,
  NOTE_META,
  NoteOriginTag,
  NoteTypeIcon,
  StickyNoteCard,
} from './NoteVisuals';

type NoteDialogState =
  | {
      mode: 'edit';
      noteIndex: number;
      text: string;
      type: NoteType;
      themeChoice: string; // 'STEP' or String(themeIndex)
      source: ComplaintSource;
    }
  | {
      mode: 'add';
      text: string;
      type: NoteType;
      themeChoice: string; // 'STEP' or String(themeIndex)
      source: ComplaintSource;
    };

export function BoardView({
  board,
  profileSnapshot,
  sessionDate,
  isPreview = false,
  viewerRole = 'employee',
  rebuildCount = 0,
  rebuilding = false,
  buildElapsedSeconds = 0,
  saving = false,
  hideEmployeeName = false,
  onRemoveNote,
  onEditNote,
  onAddNote,
  onRenameTheme,
  onEditImprovement,
  onRebuild,
  onSaveBoard,
  onBackToChat,
}: {
  board: AffinityBoard;
  profileSnapshot?: ProfileSnapshot;
  sessionDate?: string;
  isPreview?: boolean;
  viewerRole?: 'employee' | 'admin';
  rebuildCount?: number;
  rebuilding?: boolean;
  buildElapsedSeconds?: number;
  saving?: boolean;
  hideEmployeeName?: boolean;
  onRemoveNote?: (noteIndex: number) => void;
  onEditNote?: (
    noteIndex: number,
    updates: {
      text: string;
      type: NoteType;
      targetThemeIndex: number | null;
      source?: ComplaintSource;
    }
  ) => void;
  onAddNote?: (input: {
    text: string;
    type: NoteType;
    targetThemeIndex: number | null;
    source?: ComplaintSource;
  }) => void;
  onRenameTheme?: (themeIndex: number, newTitle: string) => void;
  onEditImprovement?: (
    improvementIndex: number,
    updates: { owner: string; firstStep: string }
  ) => void;
  onRebuild?: () => void;
  onSaveBoard?: () => void;
  onBackToChat?: () => void;
}) {
  const [showRebuildConfirm, setShowRebuildConfirm] = useState(false);

  const [noteDialog, setNoteDialog] = useState<NoteDialogState | null>(null);
  const [noteError, setNoteError] = useState<string | null>(null);

  const [renameDialog, setRenameDialog] = useState<{
    themeIndex: number;
    title: string;
  } | null>(null);
  const [renameError, setRenameError] = useState<string | null>(null);

  const [impDialog, setImpDialog] = useState<{
    improvementIndex: number;
    idea: string;
    owner: string;
    firstStep: string;
  } | null>(null);
  const [impError, setImpError] = useState<string | null>(null);

  const stepNotes = board.notes
    .map((note, idx) => ({ note, idx }))
    .filter((item) => item.note.type === 'Step');

  const priorityTheme =
    board.priority.themeIndex !== null && board.themes[board.priority.themeIndex]
      ? board.themes[board.priority.themeIndex]
      : null;

  function openEditNote(noteIndex: number, themeIndex: number | null) {
    const note = board.notes[noteIndex];
    if (!note) return;
    setNoteError(null);
    setNoteDialog({
      mode: 'edit',
      noteIndex,
      text: note.text,
      type: note.type,
      themeChoice:
        note.type === 'Step'
          ? 'STEP'
          : themeIndex !== null
          ? String(themeIndex)
          : board.themes.length > 0
          ? '0'
          : 'STEP',
      source: note.source || 'Learners',
    });
  }

  function openAddNote(themeIndex: number | null) {
    setNoteError(null);
    const isStepTarget = themeIndex === null;
    setNoteDialog({
      mode: 'add',
      text: '',
      type: isStepTarget ? 'Step' : 'Difficulty',
      themeChoice: isStepTarget ? 'STEP' : String(themeIndex),
      source: 'Learners',
    });
  }

  function handleNoteTypeChange(nextType: NoteType) {
    setNoteDialog((prev) => {
      if (!prev) return null;
      let nextTheme = prev.themeChoice;
      if (nextType === 'Step') {
        nextTheme = 'STEP';
      } else if (prev.themeChoice === 'STEP') {
        nextTheme = board.themes.length > 0 ? '0' : 'STEP';
      }
      return {
        ...prev,
        type: nextType,
        themeChoice: nextTheme,
      };
    });
  }

  function handleNoteThemeChange(nextThemeChoice: string) {
    setNoteDialog((prev) => {
      if (!prev) return null;
      let nextType = prev.type;
      if (nextThemeChoice === 'STEP') {
        nextType = 'Step';
      } else if (prev.type === 'Step') {
        nextType = 'Difficulty';
      }
      return {
        ...prev,
        type: nextType,
        themeChoice: nextThemeChoice,
      };
    });
  }

  function handleNoteDialogSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!noteDialog) return;
    const trimmed = noteDialog.text.trim();
    if (trimmed.length < 1 || trimmed.length > 200) {
      setNoteError('Note text must be between 1 and 200 characters.');
      return;
    }

    const targetThemeIndex =
      noteDialog.type === 'Step' || noteDialog.themeChoice === 'STEP'
        ? null
        : Number.parseInt(noteDialog.themeChoice, 10);

    const payload = {
      text: trimmed,
      type: noteDialog.type,
      targetThemeIndex:
        targetThemeIndex !== null && !Number.isNaN(targetThemeIndex)
          ? targetThemeIndex
          : null,
      source: noteDialog.type === 'Complaint' ? noteDialog.source || 'Other' : ('' as const),
    };

    if (noteDialog.mode === 'edit') {
      onEditNote?.(noteDialog.noteIndex, payload);
    } else {
      onAddNote?.(payload);
    }
    setNoteDialog(null);
    setNoteError(null);
  }

  function handleRenameSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!renameDialog) return;
    const trimmed = renameDialog.title.trim();
    if (trimmed.length < 1 || trimmed.length > 60) {
      setRenameError('Theme title must be between 1 and 60 characters.');
      return;
    }
    onRenameTheme?.(renameDialog.themeIndex, trimmed);
    setRenameDialog(null);
    setRenameError(null);
  }

  function handleImpSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!impDialog) return;
    const cleanOwner = impDialog.owner.trim();
    const cleanStep = impDialog.firstStep.trim();
    if (cleanOwner.length < 1 || cleanOwner.length > 140) {
      setImpError('Owner must be between 1 and 140 characters.');
      return;
    }
    if (cleanStep.length > 240) {
      setImpError('First step must be at most 240 characters.');
      return;
    }
    onEditImprovement?.(impDialog.improvementIndex, {
      owner: cleanOwner,
      firstStep: cleanStep,
    });
    setImpDialog(null);
    setImpError(null);
  }

  return (
    <div className="space-y-6 fade-in-panel">
      {/* Rebuild confirmation dialog */}
      <ConfirmDialog
        open={showRebuildConfirm}
        title="Rebuild Affinity Board?"
        message="Rebuild makes a new board from your answers. Your edits, added notes and removed notes will be replaced. Continue?"
        confirmLabel="Continue"
        cancelLabel="Cancel"
        onConfirm={() => {
          setShowRebuildConfirm(false);
          onRebuild?.();
        }}
        onCancel={() => setShowRebuildConfirm(false)}
      />

      {/* Add / Edit Note Dialog */}
      {noteDialog ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="note-dialog-title"
        >
          <form
            onSubmit={handleNoteDialogSubmit}
            className="sec-card max-w-md w-full p-6 fade-in-panel space-y-4"
          >
            <div className="flex items-center justify-between gap-2">
              <h3 id="note-dialog-title" className="text-lg font-bold text-slate-800">
                {noteDialog.mode === 'edit' ? 'Edit note' : 'Add a note'}
              </h3>
              <button
                type="button"
                onClick={() => setNoteDialog(null)}
                aria-label="Close dialog"
                className="p-1 rounded-lg hover:bg-[#FBF7EF] text-slate-500 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Note type
                </label>
                <select
                  value={noteDialog.type}
                  onChange={(e) => handleNoteTypeChange(e.target.value as NoteType)}
                  className="w-full px-3 py-2 rounded-lg border border-[#EADFCB] bg-white text-sm text-slate-800"
                >
                  {NOTE_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Theme / Section
                </label>
                <select
                  value={noteDialog.themeChoice}
                  onChange={(e) => handleNoteThemeChange(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-[#EADFCB] bg-white text-sm text-slate-800"
                >
                  <option value="STEP">Routine steps</option>
                  {board.themes.map((t, i) => (
                    <option key={`opt-theme-${i}`} value={String(i)}>
                      {t.title}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {noteDialog.type === 'Complaint' ? (
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Who raised this complaint?
                </label>
                <select
                  value={noteDialog.source || 'Other'}
                  onChange={(e) =>
                    setNoteDialog((prev) =>
                      prev
                        ? { ...prev, source: e.target.value as ComplaintSource }
                        : null
                    )
                  }
                  className="w-full px-3 py-2 rounded-lg border border-[#EADFCB] bg-white text-sm text-slate-800"
                >
                  {COMPLAINT_SOURCES.map((src) => (
                    <option key={src} value={src}>
                      {src}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Note text
              </label>
              <textarea
                rows={3}
                maxLength={200}
                value={noteDialog.text}
                onChange={(e) =>
                  setNoteDialog((prev) =>
                    prev ? { ...prev, text: e.target.value } : null
                  )
                }
                placeholder="Write a clear, specific note from your routine…"
                className="w-full px-3 py-2 rounded-lg border border-[#EADFCB] bg-[#FBF7EF]/50 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#F59E0B]"
                autoFocus
              />
              <div className="mt-1 flex items-center justify-between text-xs text-slate-500 tabular-nums">
                <span>1–200 characters</span>
                <span>{noteDialog.text.trim().length} / 200</span>
              </div>
            </div>

            {noteError ? (
              <p className="text-xs text-red-700 font-medium">{noteError}</p>
            ) : null}

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setNoteDialog(null)}
                className="px-4 py-2 text-sm font-medium rounded-lg border border-[#EADFCB] text-slate-700 hover:bg-[#FBF7EF] cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 text-sm font-semibold rounded-lg bg-[#F59E0B] text-[#1E293B] hover:bg-[#D97706] cursor-pointer"
              >
                {noteDialog.mode === 'edit' ? 'Save note' : 'Add note'}
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {/* Rename Theme Dialog */}
      {renameDialog ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="rename-theme-title"
        >
          <form
            onSubmit={handleRenameSubmit}
            className="sec-card max-w-md w-full p-6 fade-in-panel space-y-4"
          >
            <h3 id="rename-theme-title" className="text-lg font-bold text-slate-800">
              Rename theme
            </h3>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Theme title
              </label>
              <input
                type="text"
                maxLength={60}
                value={renameDialog.title}
                onChange={(e) =>
                  setRenameDialog((prev) =>
                    prev ? { ...prev, title: e.target.value } : null
                  )
                }
                className="w-full px-3 py-2 rounded-lg border border-[#EADFCB] bg-[#FBF7EF]/50 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#F59E0B]"
                autoFocus
              />
              <div className="mt-1 flex items-center justify-between text-xs text-slate-500 tabular-nums">
                <span>1–60 characters</span>
                <span>{renameDialog.title.trim().length} / 60</span>
              </div>
            </div>

            {renameError ? (
              <p className="text-xs text-red-700 font-medium">{renameError}</p>
            ) : null}

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setRenameDialog(null)}
                className="px-4 py-2 text-sm font-medium rounded-lg border border-[#EADFCB] text-slate-700 hover:bg-[#FBF7EF] cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 text-sm font-semibold rounded-lg bg-[#F59E0B] text-[#1E293B] hover:bg-[#D97706] cursor-pointer"
              >
                Save title
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {/* Edit Improvement Dialog */}
      {impDialog ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="edit-imp-title"
        >
          <form
            onSubmit={handleImpSubmit}
            className="sec-card max-w-md w-full p-6 fade-in-panel space-y-4"
          >
            <h3 id="edit-imp-title" className="text-lg font-bold text-slate-800">
              Edit improvement details
            </h3>
            <p className="text-xs text-slate-600 bg-[#FBF7EF] p-3 rounded-lg border border-[#EADFCB]">
              {impDialog.idea}
            </p>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Owner
              </label>
              <input
                type="text"
                maxLength={140}
                value={impDialog.owner}
                onChange={(e) =>
                  setImpDialog((prev) =>
                    prev ? { ...prev, owner: e.target.value } : null
                  )
                }
                placeholder="e.g., Grade 10 Computer Teacher"
                className="w-full px-3 py-2 rounded-lg border border-[#EADFCB] bg-white text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#F59E0B]"
                autoFocus
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                First step
              </label>
              <textarea
                rows={3}
                maxLength={240}
                value={impDialog.firstStep}
                onChange={(e) =>
                  setImpDialog((prev) =>
                    prev ? { ...prev, firstStep: e.target.value } : null
                  )
                }
                placeholder="Concrete first action this week or month…"
                className="w-full px-3 py-2 rounded-lg border border-[#EADFCB] bg-white text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#F59E0B]"
              />
            </div>

            {impError ? (
              <p className="text-xs text-red-700 font-medium">{impError}</p>
            ) : null}

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setImpDialog(null)}
                className="px-4 py-2 text-sm font-medium rounded-lg border border-[#EADFCB] text-slate-700 hover:bg-[#FBF7EF] cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 text-sm font-semibold rounded-lg bg-[#F59E0B] text-[#1E293B] hover:bg-[#D97706] cursor-pointer"
              >
                Save changes
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {isPreview ? (
        <div className="sec-card p-4 md:p-5 bg-[#FFFBEB] border-[#F59E0B] space-y-3">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <h2 className="text-lg font-bold text-slate-800">
                Here is your board. Is this right?
              </h2>
              <p className="text-sm text-slate-600 mt-0.5">
                You can edit, add, or remove notes, rename themes, or edit improvement owners
                (counts update immediately), rebuild up to {Math.max(0, 2 - rebuildCount)}{' '}
                more time(s), or save your board.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2.5 shrink-0">
              {onBackToChat ? (
                <button
                  type="button"
                  onClick={onBackToChat}
                  disabled={rebuilding || saving}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-sm font-medium rounded-lg border border-[#EADFCB] bg-white text-slate-700 hover:bg-[#FBF7EF] disabled:opacity-50 cursor-pointer"
                >
                  <ArrowLeft className="w-4 h-4" />
                  Back to chat
                </button>
              ) : null}
              {onRebuild ? (
                <button
                  type="button"
                  onClick={() => setShowRebuildConfirm(true)}
                  disabled={rebuilding || saving || rebuildCount >= 2}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-sm font-medium rounded-lg border border-[#EADFCB] bg-white text-slate-800 hover:bg-[#FBF7EF] disabled:opacity-50 cursor-pointer"
                >
                  <RefreshCw className={`w-4 h-4 ${rebuilding ? 'animate-spin' : ''}`} />
                  {rebuilding ? 'Rebuilding…' : `Rebuild (${2 - rebuildCount} left)`}
                </button>
              ) : null}
              {onSaveBoard ? (
                <button
                  type="button"
                  onClick={onSaveBoard}
                  disabled={rebuilding || saving}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold rounded-lg bg-[#F59E0B] text-[#1E293B] hover:bg-[#D97706] disabled:opacity-50 cursor-pointer"
                >
                  <Check className="w-4 h-4" />
                  {saving ? 'Saving…' : 'Save my board'}
                </button>
              ) : null}
            </div>
          </div>

          {rebuilding ? (
            <div className="px-3.5 py-2.5 rounded-lg bg-white border border-[#F59E0B] text-xs font-semibold text-slate-800 tabular-nums">
              Building your Affinity Board… {buildElapsedSeconds}s (usually 20-40 seconds)
            </div>
          ) : null}
        </div>
      ) : null}

      {/* Header & Summary Card */}
      <div className="sec-card p-5 md:p-6">
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
              {profileSnapshot ? (
                <>
                  <span>
                    {hideEmployeeName
                      ? profileSnapshot.roleCategory
                      : `${toTitleCaseFirstName(profileSnapshot.displayName)} · ${profileSnapshot.roleCategory}`}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span>{profileSnapshot.position}</span>
                  <span aria-hidden="true">·</span>
                  <span>{profileSnapshot.department}</span>
                </>
              ) : null}
              {sessionDate ? (
                <>
                  <span aria-hidden="true">·</span>
                  <span>{formatDateShort(sessionDate)}</span>
                </>
              ) : null}
              {board.routineCode && board.routineCode !== 'None' ? (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="font-mono font-semibold text-slate-700">
                    Standard {board.routineCode}
                  </span>
                </>
              ) : null}
            </div>
            <h2 className="text-xl md:text-2xl font-bold text-slate-800 mt-1.5">
              {board.routine || 'Quality Circle Affinity Board'}
            </h2>
          </div>

          {/* Note Type Counts Strip */}
          <div className="flex flex-wrap items-center gap-3 text-xs tabular-nums shrink-0">
            {(['Difficulty', 'Complaint', 'Strength', 'Suggestion'] as const).map(
              (type) => (
                <div
                  key={type}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border"
                  style={{
                    backgroundColor: NOTE_META[type].bg,
                    borderColor: NOTE_META[type].border,
                    color: NOTE_META[type].text,
                  }}
                >
                  <NoteTypeIcon type={type} className="w-3.5 h-3.5" />
                  <span className="font-semibold">{board.stats.byType[type]}</span>
                  <span>{type}</span>
                </div>
              )
            )}
          </div>
        </div>

        <p className="mt-4 text-sm md:text-[15px] text-slate-700 leading-relaxed max-w-4xl">
          {board.summary}
        </p>

        {/* Steps of the routine strip */}
        {stepNotes.length > 0 || (isPreview && onAddNote) ? (
          <div className="mt-5 pt-4 border-t border-[#EADFCB]">
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2.5">
              Steps of the routine ({stepNotes.length})
            </h3>
            <div className="flex flex-wrap gap-2">
              {stepNotes.map(({ note, idx }, stepIdx) => (
                <div
                  key={`step-${idx}`}
                  className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm"
                  style={{
                    backgroundColor: NOTE_META.Step.bg,
                    border: `1px solid ${NOTE_META.Step.border}`,
                    color: NOTE_META.Step.text,
                  }}
                >
                  <span className="w-5 h-5 rounded-full bg-slate-700 text-white text-xs font-bold flex items-center justify-center tabular-nums shrink-0">
                    {stepIdx + 1}
                  </span>
                  <span className="font-sticky text-[17px] leading-tight">
                    {note.text}
                  </span>
                  <NoteOriginTag
                    addedByEmployee={note.addedByEmployee}
                    editedByEmployee={note.editedByEmployee}
                    viewerRole={viewerRole}
                  />
                  {isPreview && (onEditNote || onRemoveNote) ? (
                    <span className="inline-flex items-center gap-0.5 ml-1">
                      {onEditNote ? (
                        <button
                          type="button"
                          onClick={() => openEditNote(idx, null)}
                          aria-label="Edit step note"
                          title="Edit step note"
                          className="p-1 rounded-full text-slate-600 hover:bg-black/10 hover:text-slate-900 cursor-pointer"
                        >
                          <Pencil className="w-3 h-3" />
                        </button>
                      ) : null}
                      {onRemoveNote ? (
                        <button
                          type="button"
                          onClick={() => onRemoveNote(idx)}
                          aria-label="Remove step note"
                          title="Remove step note"
                          className="px-1 text-slate-600 hover:text-slate-900 font-bold cursor-pointer"
                        >
                          ×
                        </button>
                      ) : null}
                    </span>
                  ) : null}
                </div>
              ))}
            </div>

            {isPreview && onAddNote ? (
              <div className="mt-3">
                <button
                  type="button"
                  onClick={() => openAddNote(null)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-dashed border-slate-400 bg-[#FBF7EF] text-xs font-semibold text-slate-700 hover:bg-[#EFE6D2] cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Add a note
                </button>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      {/* Priority Theme Callout */}
      {priorityTheme ? (
        <div className="sec-card p-5 border-2 border-[#F59E0B] bg-[#FFFDF5]">
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[#F59E0B] text-[#1E293B] text-xs font-bold">
              <Star className="w-3.5 h-3.5 fill-current" aria-hidden="true" />
              Priority Theme
            </span>
            <h3 className="text-base font-bold text-slate-800">{priorityTheme.title}</h3>
            <HeatChip heat={priorityTheme.heat} />
          </div>
          <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            <div>
              <span className="font-semibold text-slate-700">Why fix this first: </span>
              <span className="text-slate-600">
                {board.priority.reason || 'Highlighted as top priority during check-in.'}
              </span>
            </div>
            <div>
              <span className="font-semibold text-slate-700">Sign of success: </span>
              <span className="text-slate-600">
                {board.priority.signOfSuccess || 'Fewer recurring delays and complaints.'}
              </span>
            </div>
          </div>
        </div>
      ) : null}

      {/* Affinity Board Themes (Cork Board Columns) */}
      <div className="cork-board rounded-[14px] p-4 md:p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-bold text-slate-800">
            Affinity Board Themes ({board.themes.length})
          </h3>
          <span className="text-xs font-medium text-slate-700 tabular-nums">
            {board.stats.totalNonStepNotes} grouped notes · {board.stats.painPoints} pain points
          </span>
        </div>

        {board.themes.length === 0 ? (
          <div className="bg-white/80 rounded-xl p-6 text-center text-sm text-slate-600">
            No grouped notes were generated for this check-in.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 items-start">
            {board.themes.map((theme, tIdx) => {
              const isPriority = board.priority.themeIndex === tIdx;
              return (
                <div
                  key={`theme-${tIdx}`}
                  className={`rounded-[14px] bg-white/95 p-4 flex flex-col gap-3.5 ${
                    isPriority
                      ? 'ring-2 ring-[#F59E0B] border border-[#F59E0B]'
                      : 'border border-[#EADFCB]'
                  }`}
                >
                  <div className="pb-2.5 border-b border-[#EADFCB]">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-1.5 min-w-0">
                        {isPriority ? (
                          <Star
                            className="w-4 h-4 text-[#F59E0B] fill-[#F59E0B] shrink-0"
                            aria-label="Priority theme"
                          />
                        ) : null}
                        <h4 className="font-bold text-slate-800 text-base leading-snug break-words">
                          {theme.title}
                        </h4>
                        {isPreview && onRenameTheme ? (
                          <button
                            type="button"
                            onClick={() => {
                              setRenameError(null);
                              setRenameDialog({
                                themeIndex: tIdx,
                                title: theme.title,
                              });
                            }}
                            aria-label={`Rename theme ${theme.title}`}
                            title="Rename theme"
                            className="p-1 rounded-full text-slate-500 hover:bg-[#FBF7EF] hover:text-slate-800 shrink-0 cursor-pointer"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                        ) : null}
                      </div>
                      <HeatChip heat={theme.heat} />
                    </div>

                    <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-slate-500 tabular-nums">
                      <span>{theme.painNotes} pain</span>
                      <span aria-hidden="true">·</span>
                      <span>{theme.suggestions} suggestion</span>
                      {theme.code && theme.code !== 'None' ? (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="font-mono font-semibold text-slate-700">
                            {theme.code}
                          </span>
                        </>
                      ) : null}
                    </div>

                    {theme.cause ? (
                      <p className="mt-2 text-xs text-slate-600 leading-relaxed">
                        <span className="font-semibold text-slate-700">Cause: </span>
                        {theme.cause}
                      </p>
                    ) : null}
                  </div>

                  <div className="space-y-3">
                    {theme.noteIndexes.length === 0 ? (
                      <p className="text-xs text-slate-400 italic py-2">
                        All notes removed from this theme.
                      </p>
                    ) : (
                      theme.noteIndexes.map((noteIdx, pos) => {
                        const note = board.notes[noteIdx];
                        if (!note) return null;
                        return (
                          <StickyNoteCard
                            key={`note-${noteIdx}`}
                            note={note}
                            tiltIndex={noteIdx + pos}
                            viewerRole={viewerRole}
                            onEdit={
                              isPreview && onEditNote
                                ? () => openEditNote(noteIdx, tIdx)
                                : undefined
                            }
                            onRemove={
                              isPreview && onRemoveNote
                                ? () => onRemoveNote(noteIdx)
                                : undefined
                            }
                          />
                        );
                      })
                    )}
                  </div>

                  {isPreview && onAddNote ? (
                    <button
                      type="button"
                      onClick={() => openAddNote(tIdx)}
                      className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-dashed border-[#D4BC94] bg-[#FBF7EF]/70 text-xs font-semibold text-slate-700 hover:bg-[#EFE6D2] cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Add a note
                    </button>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Process Improvements */}
      <div className="sec-card p-5 md:p-6">
        <h3 className="text-base font-bold text-slate-800 mb-3">
          Process Improvement Ideas ({board.improvements.length})
        </h3>
        {board.improvements.length === 0 ? (
          <p className="text-sm text-slate-500">
            No improvement ideas were recorded for this routine yet.
          </p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {board.improvements.map((imp, idx) => (
              <div
                key={`imp-${idx}`}
                className="rounded-xl border border-[#EADFCB] bg-[#FBF7EF] p-4 flex flex-col justify-between gap-3"
              >
                <div>
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="inline-flex items-center gap-1 font-semibold text-slate-700">
                      {imp.origin === 'Employee' ? (
                        <>
                          <UserCheck
                            className="w-3.5 h-3.5 text-emerald-700"
                            aria-hidden="true"
                          />
                          Your idea
                        </>
                      ) : (
                        <>
                          <Sparkles
                            className="w-3.5 h-3.5 text-amber-700"
                            aria-hidden="true"
                          />
                          Facilitator&apos;s suggestion
                        </>
                      )}
                    </span>
                    <div className="flex items-center gap-2">
                      {imp.code && imp.code !== 'None' ? (
                        <span className="font-mono font-semibold text-slate-600">
                          {imp.code}
                        </span>
                      ) : null}
                      {isPreview && onEditImprovement ? (
                        <button
                          type="button"
                          onClick={() => {
                            setImpError(null);
                            setImpDialog({
                              improvementIndex: idx,
                              idea: imp.idea,
                              owner: imp.owner,
                              firstStep: imp.firstStep,
                            });
                          }}
                          aria-label="Edit improvement owner and first step"
                          title="Edit owner and first step"
                          className="p-1 rounded-full text-slate-500 hover:bg-[#EFE6D2] hover:text-slate-800 cursor-pointer"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                      ) : null}
                    </div>
                  </div>
                  <p className="mt-2 text-sm font-semibold text-slate-800 leading-snug">
                    {imp.idea}
                  </p>
                </div>

                <div className="pt-2 border-t border-[#EADFCB] text-xs text-slate-600 space-y-1">
                  <div>
                    <span className="font-semibold text-slate-700">Owner: </span>
                    {imp.owner}
                  </div>
                  {imp.firstStep ? (
                    <div>
                      <span className="font-semibold text-slate-700">First step: </span>
                      {imp.firstStep}
                    </div>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
