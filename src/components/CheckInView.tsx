import React, { useEffect, useRef, useState } from 'react';
import {
  collection,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import {
  AlertCircle,
  Check,
  LayoutGrid,
  MessageSquarePlus,
  Send,
  Sparkles,
} from 'lucide-react';
import type { User } from 'firebase/auth';
import {
  addNoteToBoard,
  editImprovementInBoard,
  editNoteInBoard,
  finalizeBoardForSave,
  removeNoteFromBoard,
  renameThemeInBoard,
} from '../../shared/boardMath';
import {
  type AffinityBoard,
  type CircleSession,
  type InteractionMessage,
  TOPICS,
  type UserProfile,
} from '../../shared/types';
import { apiFetch } from '../lib/api';
import {
  db,
  stripUndefined,
  toIsoString,
  writeWithTimeout,
} from '../lib/firebase';
import {
  formatTimeShort,
  getFacilitatorMessageLabel,
  renderSafeMarkdown,
} from '../lib/formatters';
import { BoardView } from './BoardView';
import { ConfirmDialog } from './NoteVisuals';

export function CheckInView({
  user,
  profile,
  activeSession,
  startingSession,
  onStartNewCheckIn,
  onSessionCompleted,
  onGoProfile,
  onToastError,
}: {
  user: User;
  profile: UserProfile | null;
  activeSession: CircleSession | null;
  startingSession: boolean;
  onStartNewCheckIn: () => void;
  onSessionCompleted: (session: CircleSession) => void;
  onGoProfile: () => void;
  onToastError: (msg: string) => void;
}) {
  const [messages, setMessages] = useState<InteractionMessage[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);

  const [draft, setDraft] = useState('');
  const [pendingClientMsgId, setPendingClientMsgId] = useState<string | null>(null);
  const [failedUnsavedText, setFailedUnsavedText] = useState<string | null>(null);
  const [failedReplyPayload, setFailedReplyPayload] = useState<{
    sessionId: string;
    clientMessageId: string;
    message: string;
  } | null>(null);

  const [savingMsg, setSavingMsg] = useState(false);
  const [waitingReply, setWaitingReply] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [replyError, setReplyError] = useState<string | null>(null);

  const [showBuildConfirm, setShowBuildConfirm] = useState(false);
  const [buildingBoard, setBuildingBoard] = useState(false);
  const [buildElapsedSeconds, setBuildElapsedSeconds] = useState(0);
  const [boardError, setBoardError] = useState<string | null>(null);
  const [previewBoard, setPreviewBoard] = useState<AffinityBoard | null>(null);
  const [viewMode, setViewMode] = useState<'chat' | 'preview'>('chat');
  const [localRebuildCount, setLocalRebuildCount] = useState(0);
  const [savingBoard, setSavingBoard] = useState(false);

  const chatEndRef = useRef<HTMLDivElement | null>(null);

  // Sync local rebuild count when activeSession changes
  useEffect(() => {
    setPreviewBoard(null);
    setViewMode('chat');
    setBoardError(null);
    setReplyError(null);
    setFailedUnsavedText(null);
    setFailedReplyPayload(null);
    setPendingClientMsgId(null);
    setLocalRebuildCount(activeSession?.rebuildCount ?? 0);
  }, [activeSession?.sessionId]);

  // Listen to messages for active session (read-only!)
  useEffect(() => {
    if (!activeSession) {
      setMessages([]);
      return;
    }

    setLoadingMessages(true);
    const q = query(
      collection(db, 'users', user.uid, 'interactions'),
      where('sessionId', '==', activeSession.sessionId)
    );

    const unsubscribe = onSnapshot(
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
        list.sort((a, b) => {
          const timeCmp = a.timestamp.localeCompare(b.timestamp);
          if (timeCmp !== 0) return timeCmp;
          if (a.role !== b.role) return a.role === 'assistant' ? -1 : 1;
          return (a.id || '').localeCompare(b.id || '');
        });
        setMessages(list);
        setLoadingMessages(false);
      },
      (err) => {
        setLoadingMessages(false);
        onToastError(
          err instanceof Error ? err.message : 'Could not load check-in messages.'
        );
      }
    );

    return () => unsubscribe();
  }, [activeSession?.sessionId, user.uid]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, waitingReply]);

  useEffect(() => {
    if (!waitingReply) {
      setElapsedSeconds(0);
      return;
    }
    setElapsedSeconds(1);
    const id = setInterval(() => {
      setElapsedSeconds((s) => s + 1);
    }, 1000);
    return () => clearInterval(id);
  }, [waitingReply]);

  useEffect(() => {
    if (!buildingBoard) {
      setBuildElapsedSeconds(0);
      return;
    }
    setBuildElapsedSeconds(1);
    const id = setInterval(() => {
      setBuildElapsedSeconds((s) => s + 1);
    }, 1000);
    return () => clearInterval(id);
  }, [buildingBoard]);

  if (!profile) {
    return (
      <div className="sec-card p-8 text-center max-w-lg mx-auto fade-in-panel">
        <MessageSquarePlus className="w-8 h-8 text-slate-400 mx-auto" />
        <h2 className="mt-3 text-lg font-bold text-slate-800">
          Complete your profile first
        </h2>
        <p className="mt-1.5 text-sm text-slate-600">
          Before starting a Quality Circle check-in, tell us your department, role, and position.
        </p>
        <button
          type="button"
          onClick={onGoProfile}
          className="mt-5 px-5 py-2.5 rounded-xl bg-[#F59E0B] text-[#1E293B] font-bold text-sm hover:bg-[#D97706] cursor-pointer"
        >
          Go to Profile
        </button>
      </div>
    );
  }

  if (!activeSession) {
    return (
      <div className="sec-card p-8 text-center max-w-lg mx-auto fade-in-panel">
        <MessageSquarePlus className="w-8 h-8 text-amber-600 mx-auto" />
        <h2 className="mt-3 text-lg font-bold text-slate-800">
          Start a Quality Circle Check-in
        </h2>
        <p className="mt-1.5 text-sm text-slate-600">
          In 6 short questions, the Facilitator will help you map one weekly routine into an Affinity Board.
        </p>
        <button
          type="button"
          onClick={onStartNewCheckIn}
          disabled={startingSession}
          className="mt-5 px-5 py-2.5 rounded-xl bg-[#F59E0B] text-[#1E293B] font-bold text-sm hover:bg-[#D97706] disabled:opacity-60 cursor-pointer"
        >
          {startingSession ? 'Starting…' : 'Start a Check-in'}
        </button>
      </div>
    );
  }

  const userAnswers = messages.filter((m) => m.role === 'user');
  const answerCount = userAnswers.length;
  const isClosed = answerCount >= 6;
  const canBuildBoard = answerCount >= 4;

  async function requestFacilitatorReply(payload: {
    sessionId: string;
    clientMessageId: string;
    message: string;
  }) {
    setWaitingReply(true);
    setReplyError(null);
    setFailedReplyPayload(null);

    try {
      const idToken = await user.getIdToken();
      const res = await apiFetch<{
        reply: string;
        topicNumber: number;
        answerCount: number;
        closing: boolean;
        modelUsed: string;
      }>('/api/circle/reply', idToken, {
        method: 'POST',
        body: payload,
      });

      const replyDocId = `${payload.sessionId}_a_${payload.clientMessageId}`;
      await writeWithTimeout(() =>
        setDoc(
          doc(db, 'users', user.uid, 'interactions', replyDocId),
          stripUndefined({
            sessionId: payload.sessionId,
            userId: user.uid,
            clientMessageId: payload.clientMessageId,
            role: 'assistant',
            content: res.reply,
            topicNumber: res.topicNumber,
            timestamp: serverTimestamp(),
            modelUsed: res.modelUsed,
          })
        )
      );
      setPendingClientMsgId(null);
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : 'The server is busy. Click Retry.';
      setReplyError(msg);
      setFailedReplyPayload(payload);
    } finally {
      setWaitingReply(false);
    }
  }

  async function handleSend(overrideText?: string) {
    if (!activeSession || savingMsg || waitingReply) return;

    const textToSend = (overrideText ?? draft).trim();
    if (textToSend.length < 1 || textToSend.length > 2000) {
      onToastError('Your answer must be between 1 and 2,000 characters.');
      return;
    }

    const clientMessageId = pendingClientMsgId ?? crypto.randomUUID();
    setPendingClientMsgId(clientMessageId);

    // Clear input immediately (8.4), restore if save fails
    setDraft('');
    setFailedUnsavedText(null);
    setReplyError(null);
    setSavingMsg(true);

    const currentTopic = Math.min(6, answerCount + 1);
    const msgDocId = `${activeSession.sessionId}_u_${clientMessageId}`;

    try {
      await writeWithTimeout(() =>
        setDoc(
          doc(db, 'users', user.uid, 'interactions', msgDocId),
          stripUndefined({
            sessionId: activeSession.sessionId,
            userId: user.uid,
            clientMessageId,
            role: 'user',
            content: textToSend,
            topicNumber: currentTopic,
            timestamp: serverTimestamp(),
            modelUsed: '',
          })
        )
      );

      // Update session answerCount cleanly on explicit send
      await writeWithTimeout(() =>
        updateDoc(
          doc(db, 'users', user.uid, 'circleSessions', activeSession.sessionId),
          stripUndefined({
            answerCount: Math.min(20, answerCount + 1),
          })
        )
      );
    } catch (err) {
      setSavingMsg(false);
      // Put text back in input and show Retry Save (8.4)
      setDraft(textToSend);
      setFailedUnsavedText(textToSend);
      onToastError(
        err instanceof Error
          ? err.message
          : 'Could not save your message. Please click Retry Save.'
      );
      return;
    }

    setSavingMsg(false);
    await requestFacilitatorReply({
      sessionId: activeSession.sessionId,
      clientMessageId,
      message: textToSend,
    });
  }

  async function handleBuildBoard(isRebuild = false) {
    if (!activeSession || buildingBoard) return;
    if (isRebuild && localRebuildCount >= 2) {
      setBoardError('You have reached the maximum of 2 rebuilds for this session.');
      return;
    }

    setShowBuildConfirm(false);
    setBuildingBoard(true);
    setBoardError(null);

    try {
      const idToken = await user.getIdToken();
      const res = await apiFetch<{ board: AffinityBoard; modelUsed: string }>(
        '/api/circle/board',
        idToken,
        {
          method: 'POST',
          body: { sessionId: activeSession.sessionId },
        }
      );

      if (isRebuild) {
        const nextRebuilds = localRebuildCount + 1;
        setLocalRebuildCount(nextRebuilds);
        try {
          await writeWithTimeout(() =>
            updateDoc(
              doc(db, 'users', user.uid, 'circleSessions', activeSession.sessionId),
              { rebuildCount: nextRebuilds }
            )
          );
        } catch {
          // Non-fatal if rebuildCount sync fails while previewing
        }
      }

      setPreviewBoard(res.board);
      setViewMode('preview');
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : 'Could not build your Affinity Board.';
      setBoardError(msg);
      onToastError(msg);
    } finally {
      setBuildingBoard(false);
    }
  }

  async function handleSavePreviewBoard() {
    if (!activeSession || !previewBoard || savingBoard) return;
    setSavingBoard(true);
    setBoardError(null);

    const sanitizedBoard = stripUndefined(finalizeBoardForSave(previewBoard));

    try {
      await writeWithTimeout(() =>
        updateDoc(
          doc(db, 'users', user.uid, 'circleSessions', activeSession.sessionId),
          stripUndefined({
            status: 'completed',
            board: sanitizedBoard,
            completedAt: serverTimestamp(),
            rebuildCount: localRebuildCount,
          })
        )
      );

      onSessionCompleted({
        ...activeSession,
        status: 'completed',
        answerCount,
        rebuildCount: localRebuildCount,
        board: sanitizedBoard,
        completedAt: new Date().toISOString(),
      });
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : 'Could not save your Affinity Board.';
      setBoardError(msg);
      onToastError(msg);
    } finally {
      setSavingBoard(false);
    }
  }

  if (viewMode === 'preview' && previewBoard) {
    return (
      <div className="space-y-4">
        {boardError ? (
          <div className="sec-card p-3.5 bg-red-50 border-red-200 flex items-center justify-between gap-3 text-sm text-red-800">
            <span>{boardError}</span>
            <button
              type="button"
              onClick={() => void handleSavePreviewBoard()}
              className="px-3 py-1 rounded bg-red-600 text-white text-xs font-semibold"
            >
              Retry Save
            </button>
          </div>
        ) : null}

        <BoardView
          board={previewBoard}
          profileSnapshot={activeSession.profileSnapshot}
          sessionDate={activeSession.createdAt}
          isPreview={true}
          viewerRole="employee"
          rebuildCount={localRebuildCount}
          rebuilding={buildingBoard}
          buildElapsedSeconds={buildElapsedSeconds}
          saving={savingBoard}
          onRemoveNote={(idx) =>
            setPreviewBoard((prev) => (prev ? removeNoteFromBoard(prev, idx) : null))
          }
          onEditNote={(idx, updates) =>
            setPreviewBoard((prev) => (prev ? editNoteInBoard(prev, idx, updates) : null))
          }
          onAddNote={(input) =>
            setPreviewBoard((prev) => (prev ? addNoteToBoard(prev, input) : null))
          }
          onRenameTheme={(tIdx, newTitle) =>
            setPreviewBoard((prev) => (prev ? renameThemeInBoard(prev, tIdx, newTitle) : null))
          }
          onEditImprovement={(impIdx, updates) =>
            setPreviewBoard((prev) =>
              prev ? editImprovementInBoard(prev, impIdx, updates) : null
            )
          }
          onRebuild={() => void handleBuildBoard(true)}
          onSaveBoard={() => void handleSavePreviewBoard()}
          onBackToChat={() => setViewMode('chat')}
        />
      </div>
    );
  }

  return (
    <div className="fade-in-panel">
      <ConfirmDialog
        open={showBuildConfirm}
        title="Build your Affinity Board?"
        message="The Facilitator will group all the points you shared so far into themes and improvement ideas. You can edit, add, or remove notes, or rebuild before saving."
        confirmLabel="Build My Affinity Board"
        onConfirm={() => void handleBuildBoard(false)}
        onCancel={() => setShowBuildConfirm(false)}
      />

      <div className="grid grid-cols-1 lg:grid-cols-[3fr_2fr] gap-5 lg:h-[calc(100vh-155px)] lg:min-h-[540px]">
        {/* Left: Chat column */}
        <div className="sec-card flex flex-col overflow-hidden h-[560px] lg:h-full">
          {/* Chat top bar */}
          <div className="px-4 py-3 border-b border-[#EADFCB] flex items-center justify-between gap-3 bg-[#FFFCF5]">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-full bg-[#F59E0B] text-[#1E293B] font-bold text-xs flex items-center justify-center shrink-0">
                QA
              </div>
              <div>
                <div className="text-sm font-bold text-slate-800">
                  Quality Circle Kumustahan
                </div>
                <div className="text-xs text-slate-500">
                  English, Filipino, or Bisaya · {Math.min(answerCount, 6)} of 6 answers
                </div>
              </div>
            </div>
            {previewBoard ? (
              <button
                type="button"
                onClick={() => setViewMode('preview')}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#F59E0B] text-[#1E293B] text-xs font-bold hover:bg-[#D97706]"
              >
                <LayoutGrid className="w-3.5 h-3.5" />
                Return to preview
              </button>
            ) : null}
          </div>

          {/* Scrollable messages area */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-[#FBF7EF]/50">
            {loadingMessages ? (
              <div className="text-center text-sm text-slate-500 py-8">
                Loading messages…
              </div>
            ) : null}

            {messages.map((msg, idx) => {
              const isUser = msg.role === 'user';
              return (
                <div
                  key={msg.id || `${msg.clientMessageId}-${idx}`}
                  className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`flex items-start gap-2.5 max-w-[88%] sm:max-w-[78%] ${
                      isUser ? 'flex-row-reverse' : 'flex-row'
                    }`}
                  >
                    {!isUser ? (
                      <div className="w-8 h-8 rounded-full bg-[#F59E0B] text-[#1E293B] font-bold text-xs flex items-center justify-center shrink-0 mt-1">
                        QA
                      </div>
                    ) : null}
                    <div
                      className={`rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                        isUser
                          ? 'bg-[#E0F2FE] text-slate-800 border border-sky-200'
                          : 'bg-white text-slate-800 border border-[#EADFCB]'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-3 text-[11px] font-semibold text-slate-500 mb-1">
                        <span>
                          {isUser
                            ? 'You'
                            : getFacilitatorMessageLabel(messages, idx, {
                                includeTopicName: true,
                              })}
                        </span>
                        <span className="tabular-nums">
                          {formatTimeShort(msg.timestamp)}
                        </span>
                      </div>

                      {isUser ? (
                        <p className="whitespace-pre-wrap break-words">{msg.content}</p>
                      ) : (
                        <div
                          className="markdown-prose break-words"
                          dangerouslySetInnerHTML={{
                            __html: renderSafeMarkdown(msg.content),
                          }}
                        />
                      )}
                    </div>
                  </div>
                </div>
              );
            })}

            {waitingReply ? (
              <div className="flex justify-start">
                <div className="flex items-start gap-2.5 max-w-[80%]">
                  <div className="w-8 h-8 rounded-full bg-[#F59E0B] text-[#1E293B] font-bold text-xs flex items-center justify-center shrink-0 mt-1">
                    QA
                  </div>
                  <div className="rounded-2xl px-4 py-3 bg-white border border-[#EADFCB] text-sm text-slate-600 tabular-nums">
                    The Facilitator is thinking… {elapsedSeconds}s
                  </div>
                </div>
              </div>
            ) : null}

            <div ref={chatEndRef} />
          </div>

          {/* Error banners */}
          {failedUnsavedText ? (
            <div className="px-4 py-2.5 bg-red-50 border-t border-red-200 flex items-center justify-between gap-3 text-xs text-red-800">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>Your message could not be saved. Your text is safe in the box below.</span>
              </div>
              <button
                type="button"
                onClick={() => void handleSend(failedUnsavedText)}
                className="px-3 py-1 rounded bg-red-600 text-white font-semibold shrink-0"
              >
                Retry Save
              </button>
            </div>
          ) : null}

          {replyError && failedReplyPayload ? (
            <div className="px-4 py-2.5 bg-amber-50 border-t border-amber-200 flex items-center justify-between gap-3 text-xs text-amber-900">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{replyError}</span>
              </div>
              <button
                type="button"
                onClick={() => void requestFacilitatorReply(failedReplyPayload)}
                className="px-3 py-1 rounded bg-[#F59E0B] text-[#1E293B] font-bold shrink-0"
              >
                Retry
              </button>
            </div>
          ) : null}

          {/* Answer box pinned at bottom */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void handleSend();
            }}
            className="p-3.5 border-t border-[#EADFCB] bg-white"
          >
            <div className="flex flex-col gap-2">
              <textarea
                rows={2}
                maxLength={2000}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    void handleSend();
                  }
                }}
                disabled={savingMsg || waitingReply}
                placeholder="Type your answer (English, Filipino, or Bisaya). Press Enter to send, Shift+Enter for new line."
                className="w-full px-3.5 py-2.5 rounded-xl border border-[#EADFCB] bg-[#FBF7EF]/60 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#F59E0B] resize-none"
              />
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs text-slate-500 tabular-nums">
                  {draft.length} / 2,000 characters
                </span>
                <button
                  type="submit"
                  disabled={savingMsg || waitingReply || draft.trim().length === 0}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#F59E0B] text-[#1E293B] font-bold text-sm hover:bg-[#D97706] disabled:opacity-50 cursor-pointer"
                >
                  <Send className="w-4 h-4" />
                  {savingMsg ? 'Saving…' : 'Send'}
                </button>
              </div>
            </div>
          </form>
        </div>

        {/* Right: Sticky Cork Board "Your notes so far" */}
        <div className="sec-card p-4 md:p-5 flex flex-col lg:h-full lg:overflow-hidden">
          <div className="shrink-0 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-base font-bold text-slate-800">
                Your notes so far
              </h3>
              <span className="text-xs font-semibold text-slate-600 tabular-nums">
                Answer {Math.min(answerCount, 6)} of 6
              </span>
            </div>

            {/* 6-step topic tracker */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-2 gap-2">
              {TOPICS.map((t) => {
                const done = answerCount >= t.number;
                const current = !isClosed && answerCount + 1 === t.number;
                return (
                  <div
                    key={t.number}
                    className={`flex items-center gap-2 px-2.5 py-2 rounded-lg border text-xs ${
                      done
                        ? 'bg-emerald-50 border-emerald-200 text-emerald-900 font-semibold'
                        : current
                        ? 'bg-[#FFFBEB] border-[#F59E0B] text-slate-800 font-semibold'
                        : 'bg-[#FBF7EF] border-[#EADFCB] text-slate-500'
                    }`}
                  >
                    <span
                      className={`w-5 h-5 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0 tabular-nums ${
                        done
                          ? 'bg-emerald-600 text-white'
                          : current
                          ? 'bg-[#F59E0B] text-[#1E293B]'
                          : 'bg-slate-200 text-slate-600'
                      }`}
                    >
                      {done ? <Check className="w-3 h-3" /> : t.number}
                    </span>
                    <span className="truncate">{t.name}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Mini cork board */}
          <div className="cork-board rounded-xl p-3.5 mt-3 min-h-[180px] lg:flex-1 lg:min-h-0 lg:overflow-y-auto">
            {userAnswers.length === 0 ? (
              <div className="h-full flex items-center justify-center text-center py-8 px-3">
                <p className="text-xs text-slate-700 font-medium">
                  As you answer each question, a sticky note summary will be pinned here.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2 gap-2.5">
                {userAnswers.slice(0, 6).map((ans, i) => {
                  const topicName = TOPICS[i]?.name ?? `Topic ${i + 1}`;
                  const snippet =
                    ans.content.length > 80
                      ? `${ans.content.slice(0, 80).trim()}…`
                      : ans.content;
                  return (
                    <div
                      key={ans.id || i}
                      className={`sticky-note-card ${
                        i % 2 === 0 ? 'sticky-tilt-left' : 'sticky-tilt-right'
                      } rounded-lg p-2.5 bg-[#FEF3C7] border border-[#F59E0B] text-slate-800`}
                    >
                      <div className="text-[11px] font-bold text-amber-900">
                        {i + 1}. {topicName}
                      </div>
                      <p className="font-sticky text-[16px] leading-snug mt-0.5">
                        {snippet}
                      </p>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Build My Affinity Board button */}
          <div className="shrink-0 mt-3 pt-3 border-t border-[#EADFCB] space-y-2.5">
            {boardError ? (
              <div className="p-2.5 rounded-lg bg-red-50 border border-red-200 text-xs text-red-800">
                {boardError}
              </div>
            ) : null}

            <button
              type="button"
              disabled={!canBuildBoard || buildingBoard}
              onClick={() => setShowBuildConfirm(true)}
              className={`w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl font-bold text-sm text-center whitespace-normal transition-colors cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed tabular-nums ${
                isClosed
                  ? 'bg-[#F59E0B] text-[#1E293B] hover:bg-[#D97706] ring-2 ring-[#F59E0B]/40'
                  : 'bg-[#F59E0B] text-[#1E293B] hover:bg-[#D97706]'
              }`}
            >
              <Sparkles className="w-4 h-4 shrink-0" />
              <span>
                {buildingBoard
                  ? `Building your Affinity Board… ${buildElapsedSeconds}s (usually 20-40 seconds)`
                  : 'Build My Affinity Board'}
              </span>
            </button>

            <p className="text-[11px] text-slate-500 text-center">
              {isClosed
                ? 'All 6 questions answered! Click above to generate your Affinity Board.'
                : canBuildBoard
                ? 'Enabled now (4+ answers), or continue through question 6 for full detail.'
                : `Answer at least ${4 - answerCount} more question(s) to unlock board building.`}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
