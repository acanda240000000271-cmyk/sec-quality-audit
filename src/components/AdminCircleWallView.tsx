import React, { useEffect, useMemo, useState } from 'react';
import {
  collection,
  collectionGroup,
  getDocs,
  onSnapshot,
  query,
  where,
} from 'firebase/firestore';
import { LayoutGrid, Star, X } from 'lucide-react';
import { computeCircleWallMetrics } from '../../shared/boardMath';
import {
  type AffinityBoard,
  type CircleSession,
  COMPLAINT_SOURCES,
  type InteractionMessage,
  NON_STEP_NOTE_TYPES,
  ROLE_CATEGORIES,
} from '../../shared/types';
import { db, toIsoString } from '../lib/firebase';
import {
  formatDateShort,
  formatTimeShort,
  getFacilitatorMessageLabel,
  renderSafeMarkdown,
  toTitleCaseFirstName,
} from '../lib/formatters';
import { BoardView } from './BoardView';
import { HeatChip, NOTE_META, StickyNoteCard } from './NoteVisuals';

export function AdminCircleWallView({
  onToastError,
}: {
  onToastError: (msg: string) => void;
}) {
  const [sessions, setSessions] = useState<CircleSession[]>([]);
  const [loading, setLoading] = useState(true);

  const [typeFilter, setTypeFilter] = useState<string>('ALL');
  const [roleFilter, setRoleFilter] = useState<string>('ALL');
  const [codeFilter, setCodeFilter] = useState<string>('ALL');

  const [inspectedSession, setInspectedSession] = useState<CircleSession | null>(null);
  const [inspectedTab, setInspectedTab] = useState<'board' | 'transcript'>('board');
  const [inspectedMessages, setInspectedMessages] = useState<InteractionMessage[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);

  useEffect(() => {
    const q = query(collectionGroup(db, 'circleSessions'));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const list: CircleSession[] = [];
        for (const d of snap.docs) {
          const data = d.data();
          if (data.status === 'completed' && data.board) {
            list.push({
              sessionId: String(data.sessionId ?? d.id),
              userId: String(data.userId ?? ''),
              status: 'completed',
              answerCount: typeof data.answerCount === 'number' ? data.answerCount : 0,
              rebuildCount: typeof data.rebuildCount === 'number' ? data.rebuildCount : 0,
              profileSnapshot: data.profileSnapshot as CircleSession['profileSnapshot'],
              board: data.board as AffinityBoard,
              createdAt: toIsoString(data.createdAt),
              completedAt: toIsoString(data.completedAt),
            });
          }
        }
        setSessions(list);
        setLoading(false);
      },
      (err) => {
        setLoading(false);
        onToastError(
          err instanceof Error ? err.message : 'Could not load Circle Wall sessions.'
        );
      }
    );

    return () => unsub();
  }, []);

  async function openSessionDetail(sessionId: string) {
    const found = sessions.find((s) => s.sessionId === sessionId);
    if (!found) return;
    setInspectedSession(found);
    setInspectedTab('board');
    setLoadingMessages(true);
    try {
      const q = query(
        collection(db, 'users', found.userId, 'interactions'),
        where('sessionId', '==', found.sessionId)
      );
      const snap = await getDocs(q);
      const msgs: InteractionMessage[] = snap.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          sessionId: String(data.sessionId ?? ''),
          userId: String(data.userId ?? ''),
          clientMessageId: String(data.clientMessageId ?? ''),
          role: data.role === 'user' ? 'user' : 'assistant',
          content: String(data.content ?? ''),
          topicNumber: typeof data.topicNumber === 'number' ? data.topicNumber : 1,
          timestamp: toIsoString(data.timestamp),
          modelUsed: String(data.modelUsed ?? ''),
        };
      });
      msgs.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
      setInspectedMessages(msgs);
    } catch (err) {
      onToastError(
        err instanceof Error ? err.message : 'Could not load session transcript.'
      );
      setInspectedMessages([]);
    } finally {
      setLoadingMessages(false);
    }
  }

  const metrics = useMemo(() => computeCircleWallMetrics(sessions), [sessions]);

  const availableCodes = useMemo(() => {
    const set = new Set<string>();
    for (const n of metrics.stickyNotes) {
      if (n.code && n.code !== 'None') set.add(n.code);
    }
    return Array.from(set).sort();
  }, [metrics.stickyNotes]);

  const filteredStickyNotes = useMemo(() => {
    return metrics.stickyNotes.filter((n) => {
      if (typeFilter !== 'ALL' && n.type !== typeFilter) return false;
      if (roleFilter !== 'ALL' && n.roleCategory !== roleFilter) return false;
      if (codeFilter !== 'ALL' && n.code !== codeFilter) return false;
      return true;
    });
  }, [metrics.stickyNotes, typeFilter, roleFilter, codeFilter]);

  if (loading) {
    return (
      <div className="sec-card p-10 text-center text-sm text-slate-600">
        Loading Circle Wall…
      </div>
    );
  }

  if (metrics.boardsSaved === 0) {
    return (
      <div className="sec-card p-10 text-center fade-in-panel">
        <LayoutGrid className="w-8 h-8 text-slate-400 mx-auto" />
        <h2 className="mt-3 text-lg font-bold text-slate-800">
          The Circle Wall is empty
        </h2>
        <p className="mt-1.5 text-sm text-slate-600 max-w-md mx-auto">
          Once staff complete their Quality Circle check-ins and save their Affinity Boards,
          themes, standards, complaint sources, and sticky notes will appear here.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 fade-in-panel">
      {/* Detail Modal */}
      {inspectedSession ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/55 p-3 sm:p-6"
          role="dialog"
          aria-modal="true"
        >
          <div className="bg-[#FBF7EF] border border-[#EADFCB] rounded-[14px] max-w-6xl w-full max-h-[90vh] flex flex-col overflow-hidden shadow-xl">
            <div className="px-5 py-3.5 bg-white border-b border-[#EADFCB] flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="font-bold text-slate-800">
                  {toTitleCaseFirstName(inspectedSession.profileSnapshot.displayName)} ·{' '}
                  {inspectedSession.profileSnapshot.roleCategory} ·{' '}
                  {inspectedSession.profileSnapshot.position}
                </h3>
                <p className="text-xs text-slate-500">
                  {inspectedSession.profileSnapshot.department} ·{' '}
                  {formatDateShort(inspectedSession.completedAt || inspectedSession.createdAt)}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1 p-1 rounded-lg bg-[#EFE6D2]">
                  <button
                    type="button"
                    onClick={() => setInspectedTab('board')}
                    className={`px-3 py-1 rounded text-xs font-semibold cursor-pointer ${
                      inspectedTab === 'board'
                        ? 'bg-white text-slate-900'
                        : 'text-slate-700'
                    }`}
                  >
                    Affinity Board
                  </button>
                  <button
                    type="button"
                    onClick={() => setInspectedTab('transcript')}
                    className={`px-3 py-1 rounded text-xs font-semibold cursor-pointer ${
                      inspectedTab === 'transcript'
                        ? 'bg-white text-slate-900'
                        : 'text-slate-700'
                    }`}
                  >
                    Transcript ({inspectedMessages.length})
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => setInspectedSession(null)}
                  aria-label="Close board detail"
                  className="p-1.5 rounded-lg hover:bg-[#FBF7EF] text-slate-600"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="p-4 sm:p-6 overflow-y-auto flex-1">
              {inspectedTab === 'board' && inspectedSession.board ? (
                <BoardView
                  board={inspectedSession.board}
                  profileSnapshot={inspectedSession.profileSnapshot}
                  sessionDate={inspectedSession.completedAt || inspectedSession.createdAt}
                  viewerRole="admin"
                />
              ) : loadingMessages ? (
                <p className="text-center text-sm text-slate-500 py-8">
                  Loading transcript…
                </p>
              ) : (
                <div className="space-y-3 max-w-3xl mx-auto">
                  {inspectedMessages.map((m, idx) => (
                    <div
                      key={m.id || idx}
                      className={`p-3.5 rounded-xl border text-sm ${
                        m.role === 'user'
                          ? 'bg-[#E0F2FE]/60 border-sky-200'
                          : 'bg-white border-[#EADFCB]'
                      }`}
                    >
                      <div className="flex items-center justify-between text-xs font-semibold text-slate-500 mb-1">
                        <span>
                          {m.role === 'user'
                            ? `${toTitleCaseFirstName(inspectedSession.profileSnapshot.displayName)}`
                            : getFacilitatorMessageLabel(inspectedMessages, idx, {
                                prefix: 'Facilitator · ',
                              })}
                        </span>
                        <span className="tabular-nums">{formatTimeShort(m.timestamp)}</span>
                      </div>
                      {m.role === 'user' ? (
                        <p className="whitespace-pre-wrap text-slate-800">{m.content}</p>
                      ) : (
                        <div
                          className="markdown-prose text-slate-800"
                          dangerouslySetInnerHTML={{
                            __html: renderSafeMarkdown(m.content),
                          }}
                        />
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {/* a. Five Tiles */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        {[
          { label: 'Staff interviewed', value: metrics.staffInterviewed },
          { label: 'Boards saved', value: metrics.boardsSaved },
          { label: 'Notes collected', value: metrics.notesCollected },
          { label: 'Pain points', value: metrics.painPoints },
          { label: 'Improvement ideas', value: metrics.improvementIdeas },
        ].map((tile) => (
          <div key={tile.label} className="sec-card p-4 md:p-5">
            <div className="text-xs font-semibold text-slate-500">{tile.label}</div>
            <div className="text-2xl font-bold text-slate-800 mt-1 tabular-nums">
              {tile.value}
            </div>
          </div>
        ))}
      </div>

      {/* b. Notes by type: Horizontal stacked bar */}
      <div className="sec-card p-5 md:p-6">
        <div className="flex items-center justify-between gap-3 mb-3">
          <h3 className="text-base font-bold text-slate-800">
            Notes by Type (excluding Steps)
          </h3>
          <span className="text-xs text-slate-500 tabular-nums">
            {metrics.totalNonStepNotes} notes total
          </span>
        </div>

        <div className="w-full h-7 rounded-lg overflow-hidden flex border border-[#EADFCB] bg-[#FBF7EF]">
          {metrics.notesByType.map((item) =>
            item.count > 0 ? (
              <div
                key={item.type}
                style={{
                  width: `${item.percent}%`,
                  backgroundColor: NOTE_META[item.type].barColor,
                }}
                title={`${item.type}: ${item.count} (${item.percent}%)`}
                className="h-full transition-all"
              />
            ) : null
          )}
        </div>

        <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs tabular-nums">
          {metrics.notesByType.map((item) => (
            <div key={item.type} className="flex items-center gap-2">
              <span
                className="w-3 h-3 rounded-sm shrink-0"
                style={{ backgroundColor: NOTE_META[item.type].barColor }}
              />
              <span className="font-semibold text-slate-700">{item.type}:</span>
              <span className="text-slate-600">
                {item.count} ({item.percent}%)
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* c. Themes table */}
      <div className="sec-card p-5 md:p-6">
        <h3 className="text-base font-bold text-slate-800 mb-3">
          All Themes ({metrics.themes.length})
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left tabular-nums">
            <thead>
              <tr className="border-b border-[#EADFCB] text-xs font-semibold text-slate-500">
                <th className="py-2.5 pr-3">Theme</th>
                <th className="py-2.5 px-3">Heat</th>
                <th className="py-2.5 px-3 text-right">Pain notes</th>
                <th className="py-2.5 px-3 text-right">Suggestions</th>
                <th className="py-2.5 px-3">Code</th>
                <th className="py-2.5 px-3">Role category</th>
                <th className="py-2.5 pl-3 text-right">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#EADFCB]">
              {metrics.themes.map((t) => (
                <tr
                  key={t.id}
                  onClick={() => void openSessionDetail(t.sessionId)}
                  className="hover:bg-[#FBF7EF] cursor-pointer transition-colors"
                >
                  <td className="py-2.5 pr-3 font-semibold text-slate-800">
                    <span className="inline-flex items-center gap-1.5">
                      {t.isPriority ? (
                        <Star
                          className="w-3.5 h-3.5 text-[#F59E0B] fill-[#F59E0B] shrink-0"
                          aria-label="Employee priority"
                        />
                      ) : null}
                      {t.title}
                    </span>
                  </td>
                  <td className="py-2.5 px-3">
                    <HeatChip heat={t.heat} />
                  </td>
                  <td className="py-2.5 px-3 text-right font-semibold">{t.painNotes}</td>
                  <td className="py-2.5 px-3 text-right">{t.suggestions}</td>
                  <td className="py-2.5 px-3 font-mono text-xs">{t.code}</td>
                  <td className="py-2.5 px-3 text-slate-600">{t.roleCategory}</td>
                  <td className="py-2.5 pl-3 text-right text-slate-500">
                    {formatDateShort(t.date)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* d. By Standard & e. Complaint Sources */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="sec-card p-5 md:p-6">
          <h3 className="text-base font-bold text-slate-800 mb-3">
            By Baseline Standard ({metrics.byStandard.length})
          </h3>
          {metrics.byStandard.length === 0 ? (
            <p className="text-sm text-slate-500">
              No baseline standard codes have been linked to saved boards yet.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left tabular-nums">
                <thead>
                  <tr className="border-b border-[#EADFCB] text-xs font-semibold text-slate-500">
                    <th className="py-2 pr-2">Code</th>
                    <th className="py-2 px-2 text-right">Boards</th>
                    <th className="py-2 px-2 text-right">Diff</th>
                    <th className="py-2 px-2 text-right">Comp</th>
                    <th className="py-2 px-2 text-right">Str</th>
                    <th className="py-2 pl-2 text-right">Sug</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#EADFCB]">
                  {metrics.byStandard.map((row) => (
                    <tr key={row.code}>
                      <td className="py-2 pr-2 font-mono font-semibold text-slate-800">
                        {row.code}
                      </td>
                      <td className="py-2 px-2 text-right">{row.boards}</td>
                      <td className="py-2 px-2 text-right">{row.difficulties}</td>
                      <td className="py-2 px-2 text-right">{row.complaints}</td>
                      <td className="py-2 px-2 text-right">{row.strengths}</td>
                      <td className="py-2 pl-2 text-right">{row.suggestions}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="sec-card p-5 md:p-6">
          <h3 className="text-base font-bold text-slate-800 mb-3">
            Complaint Sources
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 tabular-nums">
            {COMPLAINT_SOURCES.map((src) => (
              <div
                key={src}
                className="rounded-xl border border-[#EADFCB] bg-[#FBF7EF] p-3.5"
              >
                <div className="text-xs font-semibold text-slate-500">{src}</div>
                <div className="text-xl font-bold text-slate-800 mt-1">
                  {metrics.complaintSources[src] ?? 0}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* f. Sticky-note wall (anonymous: role category only, never name) */}
      <div className="cork-board rounded-[14px] p-5 md:p-6 space-y-4">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div>
            <h3 className="text-base font-bold text-slate-800">
              Sticky-Note Wall ({filteredStickyNotes.length})
            </h3>
            <p className="text-xs text-slate-700">
              Anonymous across staff (showing role category only, excluding routine steps).
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <select
              aria-label="Filter by note type"
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="px-3 py-1.5 rounded-lg border border-[#D4BC94] bg-white text-xs font-semibold text-slate-800"
            >
              <option value="ALL">All types</option>
              {NON_STEP_NOTE_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>

            <select
              aria-label="Filter by role category"
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
              className="px-3 py-1.5 rounded-lg border border-[#D4BC94] bg-white text-xs font-semibold text-slate-800"
            >
              <option value="ALL">All roles</option>
              {ROLE_CATEGORIES.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>

            <select
              aria-label="Filter by standard code"
              value={codeFilter}
              onChange={(e) => setCodeFilter(e.target.value)}
              className="px-3 py-1.5 rounded-lg border border-[#D4BC94] bg-white text-xs font-semibold text-slate-800"
            >
              <option value="ALL">All codes</option>
              {availableCodes.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
        </div>

        {filteredStickyNotes.length === 0 ? (
          <div className="bg-white/80 rounded-xl p-6 text-center text-sm text-slate-600">
            No sticky notes match the selected filters.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filteredStickyNotes.map((n, idx) => (
              <StickyNoteCard
                key={`${n.sessionId}-${n.noteIndex}`}
                note={n}
                tiltIndex={idx}
                subtitle={n.roleCategory}
                viewerRole="admin"
              />
            ))}
          </div>
        )}
      </div>

      {/* g. All boards */}
      <div className="sec-card p-5 md:p-6">
        <h3 className="text-base font-bold text-slate-800 mb-3">
          All Saved Boards ({metrics.boards.length})
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left tabular-nums">
            <thead>
              <tr className="border-b border-[#EADFCB] text-xs font-semibold text-slate-500">
                <th className="py-2.5 pr-3">Staff member</th>
                <th className="py-2.5 px-3">Role category</th>
                <th className="py-2.5 px-3">Position</th>
                <th className="py-2.5 px-3">Routine</th>
                <th className="py-2.5 px-3 text-right">Notes</th>
                <th className="py-2.5 px-3">Top theme</th>
                <th className="py-2.5 pl-3 text-right">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#EADFCB]">
              {metrics.boards.map((b) => (
                <tr
                  key={b.sessionId}
                  onClick={() => void openSessionDetail(b.sessionId)}
                  className="hover:bg-[#FBF7EF] cursor-pointer transition-colors"
                >
                  <td className="py-2.5 pr-3 font-semibold text-slate-800">
                    {toTitleCaseFirstName(b.displayName)}
                  </td>
                  <td className="py-2.5 px-3 text-slate-600">{b.roleCategory}</td>
                  <td className="py-2.5 px-3 text-slate-600">{b.position}</td>
                  <td className="py-2.5 px-3 font-medium text-slate-800">{b.routine}</td>
                  <td className="py-2.5 px-3 text-right">{b.noteCount}</td>
                  <td className="py-2.5 px-3">
                    <span className="inline-flex items-center gap-1.5">
                      <span>{b.topTheme}</span>
                      <HeatChip heat={b.topThemeHeat} />
                    </span>
                  </td>
                  <td className="py-2.5 pl-3 text-right text-slate-500">
                    {formatDateShort(b.date)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
