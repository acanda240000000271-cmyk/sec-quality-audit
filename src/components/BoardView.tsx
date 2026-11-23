import React from 'react';
import {
  ArrowLeft,
  Check,
  RefreshCw,
  Sparkles,
  Star,
  UserCheck,
} from 'lucide-react';
import type { AffinityBoard, ProfileSnapshot } from '../../shared/types';
import { formatDateShort, toTitleCaseFirstName } from '../lib/formatters';
import { HeatChip, NOTE_META, NoteTypeIcon, StickyNoteCard } from './NoteVisuals';

export function BoardView({
  board,
  profileSnapshot,
  sessionDate,
  isPreview = false,
  rebuildCount = 0,
  rebuilding = false,
  saving = false,
  hideEmployeeName = false,
  onRemoveNote,
  onRebuild,
  onSaveBoard,
  onBackToChat,
}: {
  board: AffinityBoard;
  profileSnapshot?: ProfileSnapshot;
  sessionDate?: string;
  isPreview?: boolean;
  rebuildCount?: number;
  rebuilding?: boolean;
  saving?: boolean;
  hideEmployeeName?: boolean;
  onRemoveNote?: (noteIndex: number) => void;
  onRebuild?: () => void;
  onSaveBoard?: () => void;
  onBackToChat?: () => void;
}) {
  const stepNotes = board.notes
    .map((note, idx) => ({ note, idx }))
    .filter((item) => item.note.type === 'Step');

  const priorityTheme =
    board.priority.themeIndex !== null && board.themes[board.priority.themeIndex]
      ? board.themes[board.priority.themeIndex]
      : null;

  return (
    <div className="space-y-6 fade-in-panel">
      {isPreview ? (
        <div className="sec-card p-4 md:p-5 bg-[#FFFBEB] border-[#F59E0B]">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <h2 className="text-lg font-bold text-slate-800">
                Here is your board. Is this right?
              </h2>
              <p className="text-sm text-slate-600 mt-0.5">
                You can remove any note with × (counts update immediately), rebuild up to{' '}
                {Math.max(0, 2 - rebuildCount)} more time(s), or save your board.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2.5 shrink-0">
              {onBackToChat ? (
                <button
                  type="button"
                  onClick={onBackToChat}
                  disabled={rebuilding || saving}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-sm font-medium rounded-lg border border-[#EADFCB] bg-white text-slate-700 hover:bg-[#FBF7EF] disabled:opacity-50"
                >
                  <ArrowLeft className="w-4 h-4" />
                  Back to chat
                </button>
              ) : null}
              {onRebuild ? (
                <button
                  type="button"
                  onClick={onRebuild}
                  disabled={rebuilding || saving || rebuildCount >= 2}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-sm font-medium rounded-lg border border-[#EADFCB] bg-white text-slate-800 hover:bg-[#FBF7EF] disabled:opacity-50"
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
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold rounded-lg bg-[#F59E0B] text-[#1E293B] hover:bg-[#D97706] disabled:opacity-50"
                >
                  <Check className="w-4 h-4" />
                  {saving ? 'Saving…' : 'Save my board'}
                </button>
              ) : null}
            </div>
          </div>
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
            {(
              ['Difficulty', 'Complaint', 'Strength', 'Suggestion'] as const
            ).map((type) => (
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
            ))}
          </div>
        </div>

        <p className="mt-4 text-sm md:text-[15px] text-slate-700 leading-relaxed max-w-4xl">
          {board.summary}
        </p>

        {/* Steps of the routine strip */}
        {stepNotes.length > 0 ? (
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
                  {isPreview && onRemoveNote ? (
                    <button
                      type="button"
                      onClick={() => onRemoveNote(idx)}
                      aria-label="Remove step note"
                      className="ml-1 text-slate-600 hover:text-slate-900 font-bold"
                    >
                      ×
                    </button>
                  ) : null}
                </div>
              ))}
            </div>
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
            <h3 className="text-base font-bold text-slate-800">
              {priorityTheme.title}
            </h3>
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
                      <div className="flex items-center gap-1.5">
                        {isPriority ? (
                          <Star
                            className="w-4 h-4 text-[#F59E0B] fill-[#F59E0B] shrink-0"
                            aria-label="Priority theme"
                          />
                        ) : null}
                        <h4 className="font-bold text-slate-800 text-base leading-snug">
                          {theme.title}
                        </h4>
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
                          <UserCheck className="w-3.5 h-3.5 text-emerald-700" aria-hidden="true" />
                          Your idea
                        </>
                      ) : (
                        <>
                          <Sparkles className="w-3.5 h-3.5 text-amber-700" aria-hidden="true" />
                          Facilitator&apos;s suggestion
                        </>
                      )}
                    </span>
                    {imp.code && imp.code !== 'None' ? (
                      <span className="font-mono font-semibold text-slate-600">
                        {imp.code}
                      </span>
                    ) : null}
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
