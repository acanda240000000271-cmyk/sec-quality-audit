import React, { useEffect, useState } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import {
  ArrowLeft,
  ClipboardList,
  LayoutGrid,
  MessageSquare,
  Play,
} from 'lucide-react';
import type { User } from 'firebase/auth';
import type { CircleSession, InteractionMessage } from '../../shared/types';
import { db, toIsoString } from '../lib/firebase';
import {
  formatDateShort,
  formatTimeShort,
  renderSafeMarkdown,
} from '../lib/formatters';
import { BoardView } from './BoardView';
import { HeatChip } from './NoteVisuals';

export function MyBoardsView({
  user,
  sessions,
  selectedSession,
  onSelectSession,
  onContinueOpenSession,
  onStartNewCheckIn,
  onToastError,
}: {
  user: User;
  sessions: CircleSession[];
  selectedSession: CircleSession | null;
  onSelectSession: (session: CircleSession | null) => void;
  onContinueOpenSession: (session: CircleSession) => void;
  onStartNewCheckIn: () => void;
  onToastError: (msg: string) => void;
}) {
  const [subTab, setSubTab] = useState<'board' | 'transcript'>('board');
  const [transcript, setTranscript] = useState<InteractionMessage[]>([]);
  const [loadingTranscript, setLoadingTranscript] = useState(false);

  useEffect(() => {
    if (!selectedSession) {
      setTranscript([]);
      return;
    }

    setSubTab(selectedSession.board ? 'board' : 'transcript');
    setLoadingTranscript(true);

    const q = query(
      collection(db, 'users', user.uid, 'interactions'),
      where('sessionId', '==', selectedSession.sessionId)
    );

    const unsub = onSnapshot(
      q,
      (snap) => {
        const list: InteractionMessage[] = snap.docs.map((d) => {
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
        list.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
        setTranscript(list);
        setLoadingTranscript(false);
      },
      (err) => {
        setLoadingTranscript(false);
        onToastError(
          err instanceof Error ? err.message : 'Could not load session transcript.'
        );
      }
    );

    return () => unsub();
  }, [selectedSession?.sessionId, user.uid]);

  if (selectedSession) {
    return (
      <div className="space-y-4 fade-in-panel">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => onSelectSession(null)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-[#EADFCB] bg-white text-sm font-medium text-slate-700 hover:bg-[#FBF7EF] cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            All my boards
          </button>

          <div className="flex items-center gap-1 p-1 rounded-lg bg-[#EFE6D2]">
            {selectedSession.board ? (
              <button
                type="button"
                onClick={() => setSubTab('board')}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-colors cursor-pointer ${
                  subTab === 'board'
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-700 hover:text-slate-900'
                }`}
              >
                <LayoutGrid className="w-3.5 h-3.5" />
                Affinity Board
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => setSubTab('transcript')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-colors cursor-pointer ${
                subTab === 'transcript'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-700 hover:text-slate-900'
              }`}
            >
              <MessageSquare className="w-3.5 h-3.5" />
              Transcript ({transcript.length})
            </button>
          </div>
        </div>

        {subTab === 'board' && selectedSession.board ? (
          <BoardView
            board={selectedSession.board}
            profileSnapshot={selectedSession.profileSnapshot}
            sessionDate={selectedSession.completedAt || selectedSession.createdAt}
          />
        ) : (
          <div className="sec-card p-5 md:p-6 space-y-4">
            <div className="flex items-center justify-between gap-3 pb-3 border-b border-[#EADFCB]">
              <div>
                <h2 className="text-lg font-bold text-slate-800">
                  Check-in Transcript
                </h2>
                <p className="text-xs text-slate-500">
                  Started {formatDateShort(selectedSession.createdAt)} ·{' '}
                  {selectedSession.status === 'completed' ? 'Completed' : 'Open'}
                </p>
              </div>
              {selectedSession.status === 'open' ? (
                <button
                  type="button"
                  onClick={() => onContinueOpenSession(selectedSession)}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#F59E0B] text-[#1E293B] text-xs font-bold hover:bg-[#D97706] cursor-pointer"
                >
                  <Play className="w-3.5 h-3.5" />
                  Continue check-in
                </button>
              ) : null}
            </div>

            {loadingTranscript ? (
              <p className="text-sm text-slate-500 py-6 text-center">
                Loading transcript…
              </p>
            ) : transcript.length === 0 ? (
              <p className="text-sm text-slate-500 py-6 text-center">
                No messages recorded in this session yet.
              </p>
            ) : (
              <div className="space-y-3">
                {transcript.map((m, idx) => (
                  <div
                    key={m.id || idx}
                    className={`p-3.5 rounded-xl border text-sm ${
                      m.role === 'user'
                        ? 'bg-[#E0F2FE]/60 border-sky-200'
                        : 'bg-[#FBF7EF] border-[#EADFCB]'
                    }`}
                  >
                    <div className="flex items-center justify-between text-xs font-semibold text-slate-500 mb-1">
                      <span>
                        {m.role === 'user'
                          ? 'You'
                          : `Facilitator · Topic ${m.topicNumber}`}
                      </span>
                      <span className="tabular-nums">{formatTimeShort(m.timestamp)}</span>
                    </div>
                    {m.role === 'user' ? (
                      <p className="text-slate-800 whitespace-pre-wrap">{m.content}</p>
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
        )}
      </div>
    );
  }

  const sorted = [...sessions].sort((a, b) =>
    (b.completedAt || b.createdAt).localeCompare(a.completedAt || a.createdAt)
  );

  return (
    <div className="space-y-5 fade-in-panel">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-800">My Boards</h2>
          <p className="text-sm text-slate-600">
            Review your saved Affinity Boards and transcripts, or continue an open check-in.
          </p>
        </div>
      </div>

      {sorted.length === 0 ? (
        <div className="sec-card p-10 text-center">
          <ClipboardList className="w-8 h-8 text-slate-400 mx-auto" />
          <p className="mt-3 text-sm text-slate-600">
            You have no check-in sessions yet. Start your first Quality Circle check-in to build a board.
          </p>
          <button
            type="button"
            onClick={onStartNewCheckIn}
            className="mt-4 px-5 py-2.5 rounded-xl bg-[#F59E0B] text-[#1E293B] font-bold text-sm hover:bg-[#D97706] cursor-pointer"
          >
            Start a Check-in
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {sorted.map((s) => {
            const isOpen = s.status === 'open';
            const priorityTheme =
              s.board &&
              s.board.priority.themeIndex !== null &&
              s.board.themes[s.board.priority.themeIndex]
                ? s.board.themes[s.board.priority.themeIndex]
                : s.board?.themes[0] ?? null;

            return (
              <div
                key={s.sessionId}
                className="sec-card p-5 flex flex-col justify-between gap-4"
              >
                <div>
                  <div className="flex items-center justify-between gap-2 text-xs text-slate-500">
                    <span>{formatDateShort(s.completedAt || s.createdAt)}</span>
                    <span
                      className={`font-semibold ${
                        isOpen ? 'text-amber-700' : 'text-emerald-700'
                      }`}
                    >
                      {isOpen ? `Open (${s.answerCount}/6 answers)` : 'Completed'}
                    </span>
                  </div>

                  <h3 className="mt-1.5 text-base font-bold text-slate-800">
                    {s.board?.routine || 'Check-in in progress'}
                  </h3>

                  {s.board ? (
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-600 tabular-nums">
                      <span>{s.board.notes.length} notes</span>
                      <span aria-hidden="true">·</span>
                      <span>{s.board.themes.length} themes</span>
                      {priorityTheme ? (
                        <>
                          <span aria-hidden="true">·</span>
                          <HeatChip heat={priorityTheme.heat} />
                        </>
                      ) : null}
                    </div>
                  ) : null}
                </div>

                <div className="flex items-center justify-end gap-2 pt-3 border-t border-[#EADFCB]">
                  {isOpen ? (
                    <button
                      type="button"
                      onClick={() => onContinueOpenSession(s)}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#F59E0B] text-[#1E293B] text-xs font-bold hover:bg-[#D97706] cursor-pointer"
                    >
                      <Play className="w-3.5 h-3.5" />
                      Continue check-in
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => onSelectSession(s)}
                    className="px-3.5 py-2 rounded-lg border border-[#EADFCB] bg-[#FBF7EF] text-xs font-semibold text-slate-800 hover:bg-[#EFE6D2] cursor-pointer"
                  >
                    {isOpen ? 'View transcript' : 'Open board & transcript'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
