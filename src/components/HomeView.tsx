import React, { useState } from 'react';
import {
  ArrowRight,
  Check,
  ClipboardList,
  Copy,
  MessageSquarePlus,
  Play,
  ShieldAlert,
  Star,
} from 'lucide-react';
import { type CircleSession, NOTE_TYPES, type UserProfile } from '../../shared/types';
import {
  formatDateShort,
  formatTodayLabel,
  getLocalGreeting,
  toTitleCaseFirstName,
} from '../lib/formatters';
import { HeatChip, NOTE_META, NoteTypeIcon } from './NoteVisuals';

export function HomeView({
  uid,
  displayName,
  profile,
  sessions,
  adminSetupNeeded,
  startingSession,
  onStartCheckIn,
  onContinueSession,
  onGoProfile,
  onOpenBoard,
}: {
  uid: string;
  displayName: string;
  profile: UserProfile | null;
  sessions: CircleSession[];
  adminSetupNeeded: boolean;
  startingSession: boolean;
  onStartCheckIn: () => void;
  onContinueSession: (session: CircleSession) => void;
  onGoProfile: () => void;
  onOpenBoard: (session: CircleSession) => void;
}) {
  const [copiedUid, setCopiedUid] = useState(false);

  const firstName = toTitleCaseFirstName(displayName);
  const completedSessions = sessions
    .filter((s) => s.status === 'completed' && s.board !== null)
    .sort((a, b) => (b.completedAt || b.createdAt).localeCompare(a.completedAt || a.createdAt));

  const openSession = sessions.find((s) => s.status === 'open');
  const latestBoardSession = completedSessions[0] ?? null;

  const totalNotes = completedSessions.reduce(
    (sum, s) => sum + (s.board?.notes.length ?? 0),
    0
  );

  let latestPriorityTitle = 'None yet';
  if (latestBoardSession?.board) {
    const b = latestBoardSession.board;
    if (b.priority.themeIndex !== null && b.themes[b.priority.themeIndex]) {
      latestPriorityTitle = b.themes[b.priority.themeIndex].title;
    } else if (b.themes[0]) {
      latestPriorityTitle = b.themes[0].title;
    }
  }

  let latestTopTheme = latestBoardSession?.board?.themes[0] ?? null;
  if (latestBoardSession?.board) {
    const b = latestBoardSession.board;
    if (b.priority.themeIndex !== null && b.themes[b.priority.themeIndex]) {
      latestTopTheme = b.themes[b.priority.themeIndex];
    }
  }

  return (
    <div className="space-y-6 fade-in-panel">
      {/* Super Admin First-Time Setup Card */}
      {adminSetupNeeded ? (
        <div className="sec-card p-5 border-2 border-[#F59E0B] bg-[#FFFBEB]">
          <div className="flex items-start gap-3">
            <ShieldAlert className="w-5 h-5 text-amber-700 mt-0.5 shrink-0" />
            <div className="flex-1">
              <h2 className="text-base font-bold text-slate-800">
                Super Administrator Firestore Setup Needed
              </h2>
              <p className="mt-1 text-sm text-slate-700">
                Your signed-in Google account matches the configured administrator email,
                but your marker document does not exist in Firestore yet. Create this exact
                document in the Firebase Console (Firestore Data) and refresh:
              </p>
              <div className="mt-3 p-3 rounded-lg bg-white border border-[#EADFCB] text-xs font-mono space-y-1.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span>
                    <strong>Collection:</strong> admins &nbsp;|&nbsp;{' '}
                    <strong>Document ID:</strong> {uid}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      void navigator.clipboard.writeText(uid);
                      setCopiedUid(true);
                      setTimeout(() => setCopiedUid(false), 2000);
                    }}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-[#F59E0B] text-[#1E293B] font-sans font-semibold hover:bg-[#D97706]"
                  >
                    {copiedUid ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    {copiedUid ? 'Copied UID' : 'Copy UID'}
                  </button>
                </div>
                <div>
                  <strong>Field:</strong> role = &quot;superadmin&quot; (string)
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {/* Welcome Banner */}
      <div className="warm-banner rounded-[14px] p-6 md:p-8 flex flex-col md:flex-row md:items-center md:justify-between gap-5">
        <div>
          <p className="text-xs font-semibold text-slate-600">
            {formatTodayLabel()}
          </p>
          <h1 className="text-2xl md:text-3xl font-bold text-slate-800 mt-1">
            {getLocalGreeting()}, {firstName}
          </h1>
          <p className="text-sm text-slate-600 mt-1.5 max-w-xl">
            {profile
              ? `Ready for a 6-question Quality Circle kumustahan on one of your routines as ${profile.position}.`
              : 'Complete your staff profile once so the Facilitator can tailor check-ins to your role.'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 shrink-0">
          {!profile ? (
            <button
              type="button"
              onClick={onGoProfile}
              className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-[#F59E0B] text-[#1E293B] font-bold text-sm hover:bg-[#D97706] transition-colors cursor-pointer"
            >
              Complete your profile first
              <ArrowRight className="w-4 h-4" />
            </button>
          ) : (
            <>
              {openSession ? (
                <button
                  type="button"
                  onClick={() => onContinueSession(openSession)}
                  className="inline-flex items-center gap-2 px-4 py-3 rounded-xl border border-[#EADFCB] bg-white text-slate-800 font-semibold text-sm hover:bg-[#FBF7EF] transition-colors cursor-pointer"
                >
                  <Play className="w-4 h-4" />
                  Continue open check-in ({openSession.answerCount}/6)
                </button>
              ) : null}
              <button
                type="button"
                onClick={onStartCheckIn}
                disabled={startingSession}
                className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-[#F59E0B] text-[#1E293B] font-bold text-sm hover:bg-[#D97706] transition-colors disabled:opacity-60 cursor-pointer"
              >
                <MessageSquarePlus className="w-4 h-4" />
                {startingSession ? 'Starting…' : 'Start a Check-in'}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Stat Tiles */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="sec-card p-5">
          <div className="text-xs font-semibold text-slate-500">Boards saved</div>
          <div className="text-2xl font-bold text-slate-800 mt-1 tabular-nums">
            {completedSessions.length}
          </div>
        </div>
        <div className="sec-card p-5">
          <div className="text-xs font-semibold text-slate-500">Notes collected</div>
          <div className="text-2xl font-bold text-slate-800 mt-1 tabular-nums">
            {totalNotes}
          </div>
        </div>
        <div className="sec-card p-5">
          <div className="text-xs font-semibold text-slate-500">Latest priority theme</div>
          <div className="text-base font-bold text-slate-800 mt-1.5 flex items-center gap-1.5 truncate">
            {latestPriorityTitle !== 'None yet' ? (
              <Star className="w-4 h-4 text-[#F59E0B] fill-[#F59E0B] shrink-0" />
            ) : null}
            <span className="truncate">{latestPriorityTitle}</span>
          </div>
        </div>
      </div>

      {/* Latest Board Card */}
      {latestBoardSession && latestBoardSession.board ? (
        <div className="sec-card p-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <div className="text-xs text-slate-500">
                Latest Affinity Board ·{' '}
                {formatDateShort(latestBoardSession.completedAt || latestBoardSession.createdAt)}
              </div>
              <h2 className="text-lg font-bold text-slate-800 mt-1">
                {latestBoardSession.board.routine}
              </h2>
              {latestTopTheme ? (
                <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-slate-700">
                  <span className="font-medium">Top theme: {latestTopTheme.title}</span>
                  <HeatChip heat={latestTopTheme.heat} />
                </div>
              ) : null}
            </div>
            <button
              type="button"
              onClick={() => onOpenBoard(latestBoardSession)}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-[#EADFCB] bg-[#FBF7EF] text-slate-800 font-semibold text-sm hover:bg-[#EFE6D2] transition-colors shrink-0 cursor-pointer"
            >
              View Affinity Board
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      ) : (
        <div className="sec-card p-8 text-center">
          <ClipboardList className="w-8 h-8 text-slate-400 mx-auto" />
          <p className="mt-2.5 text-sm text-slate-600">
            You haven&apos;t saved an Affinity Board yet. Start a short check-in to map one weekly routine.
          </p>
          {profile ? (
            <button
              type="button"
              onClick={onStartCheckIn}
              disabled={startingSession}
              className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#F59E0B] text-[#1E293B] font-semibold text-sm hover:bg-[#D97706] cursor-pointer"
            >
              Start your first check-in
            </button>
          ) : null}
        </div>
      )}

      {/* What is an Affinity Board? Strip */}
      <div className="sec-card p-5 md:p-6">
        <h2 className="text-sm font-bold text-slate-800 mb-3">
          What is an Affinity Board?
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          {NOTE_TYPES.map((type) => {
            const meta = NOTE_META[type];
            return (
              <div
                key={type}
                className="rounded-lg p-3"
                style={{
                  backgroundColor: meta.bg,
                  border: `1px solid ${meta.border}`,
                  color: meta.text,
                }}
              >
                <div className="flex items-center gap-1.5 text-xs font-bold">
                  <NoteTypeIcon type={type} className="w-3.5 h-3.5" />
                  <span>{meta.label}</span>
                </div>
                <p className="mt-1 text-xs leading-snug opacity-90">{meta.meaning}</p>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
