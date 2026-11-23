import React, { useEffect, useState } from 'react';
import {
  collection,
  collectionGroup,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore';
import {
  AlertCircle,
  Download,
  FileText,
  Save,
  Sparkles,
  Trash2,
} from 'lucide-react';
import type { User } from 'firebase/auth';
import type {
  AffinityBoard,
  CircleSession,
  InteractionMessage,
  WallReport,
} from '../../shared/types';
import { apiFetch } from '../lib/api';
import {
  db,
  stripUndefined,
  toIsoString,
  writeWithTimeout,
} from '../lib/firebase';
import {
  formatDateShort,
  formatDateTime,
  renderSafeMarkdown,
} from '../lib/formatters';
import { ConfirmDialog } from './NoteVisuals';

function triggerMarkdownDownload(filename: string, content: string) {
  const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function AdminReportsView({
  user,
  onToastError,
}: {
  user: User;
  onToastError: (msg: string) => void;
}) {
  const [savedReports, setSavedReports] = useState<WallReport[]>([]);
  const [loadingReports, setLoadingReports] = useState(true);

  const [generating, setGenerating] = useState(false);
  const [savingReport, setSavingReport] = useState(false);
  const [exportingTranscripts, setExportingTranscripts] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [draftReport, setDraftReport] = useState<{
    markdown: string;
    stats: Record<string, unknown>;
    modelUsed: string;
  } | null>(null);

  const [selectedReport, setSelectedReport] = useState<WallReport | null>(null);
  const [deletingReport, setDeletingReport] = useState<WallReport | null>(null);

  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, 'wallReports'),
      (snap) => {
        const list: WallReport[] = snap.docs.map((d) => {
          const data = d.data();
          return {
            id: String(data.id ?? d.id),
            title: String(data.title ?? 'School-wide Report'),
            markdown: String(data.markdown ?? ''),
            stats: (data.stats as Record<string, unknown>) ?? {},
            modelUsed: String(data.modelUsed ?? ''),
            createdAt: toIsoString(data.createdAt),
            createdBy: String(data.createdBy ?? ''),
          };
        });
        list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
        setSavedReports(list);
        setLoadingReports(false);
      },
      (err) => {
        setLoadingReports(false);
        onToastError(
          err instanceof Error ? err.message : 'Could not load saved reports.'
        );
      }
    );

    return () => unsub();
  }, []);

  async function handleGenerateReport() {
    setGenerating(true);
    setErrorMsg(null);
    setSelectedReport(null);

    try {
      const idToken = await user.getIdToken();
      const res = await apiFetch<{
        markdown: string;
        stats: Record<string, unknown>;
        modelUsed: string;
      }>('/api/admin/wall-report', idToken, {
        method: 'POST',
        body: {},
      });
      setDraftReport(res);
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : 'Could not generate school-wide report.';
      setErrorMsg(msg);
      onToastError(msg);
    } finally {
      setGenerating(false);
    }
  }

  async function handleSaveReport() {
    if (!draftReport || savingReport) return;
    setSavingReport(true);
    setErrorMsg(null);

    const id = `report_${Date.now()}`;
    const today = new Date().toISOString().slice(0, 10);
    const title = `School-wide Quality Circle Report (${today})`;

    try {
      await writeWithTimeout(() =>
        setDoc(
          doc(db, 'wallReports', id),
          stripUndefined({
            id,
            title,
            markdown: draftReport.markdown,
            stats: draftReport.stats,
            modelUsed: draftReport.modelUsed,
            createdAt: serverTimestamp(),
            createdBy: user.uid,
          })
        )
      );
      setSelectedReport({
        id,
        title,
        markdown: draftReport.markdown,
        stats: draftReport.stats,
        modelUsed: draftReport.modelUsed,
        createdAt: new Date().toISOString(),
        createdBy: user.uid,
      });
      setDraftReport(null);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not save report.';
      setErrorMsg(msg);
      onToastError(msg);
    } finally {
      setSavingReport(false);
    }
  }

  async function handleDeleteReport() {
    if (!deletingReport) return;
    const target = deletingReport;
    setDeletingReport(null);
    try {
      await writeWithTimeout(() => deleteDoc(doc(db, 'wallReports', target.id)));
      if (selectedReport?.id === target.id) {
        setSelectedReport(null);
      }
    } catch (err) {
      onToastError(err instanceof Error ? err.message : 'Could not delete report.');
    }
  }

  async function handleDownloadAllTranscripts() {
    setExportingTranscripts(true);
    setErrorMsg(null);

    try {
      const [sessionsSnap, messagesSnap] = await Promise.all([
        getDocs(query(collectionGroup(db, 'circleSessions'))),
        getDocs(query(collectionGroup(db, 'interactions'))),
      ]);

      const msgsBySession = new Map<string, InteractionMessage[]>();
      for (const d of messagesSnap.docs) {
        const data = d.data();
        const sid = String(data.sessionId ?? '');
        const key = `${String(data.userId ?? '')}__${sid}`;
        if (!msgsBySession.has(key)) msgsBySession.set(key, []);
        msgsBySession.get(key)!.push({
          id: d.id,
          sessionId: sid,
          userId: String(data.userId ?? ''),
          clientMessageId: String(data.clientMessageId ?? ''),
          role: data.role === 'user' ? 'user' : 'assistant',
          content: String(data.content ?? ''),
          topicNumber: typeof data.topicNumber === 'number' ? data.topicNumber : 1,
          timestamp: toIsoString(data.timestamp),
          modelUsed: String(data.modelUsed ?? ''),
        });
      }

      const sessions: CircleSession[] = sessionsSnap.docs.map((d) => {
        const data = d.data();
        return {
          sessionId: String(data.sessionId ?? d.id),
          userId: String(data.userId ?? ''),
          status: data.status === 'completed' ? 'completed' : 'open',
          answerCount: typeof data.answerCount === 'number' ? data.answerCount : 0,
          rebuildCount: typeof data.rebuildCount === 'number' ? data.rebuildCount : 0,
          profileSnapshot: data.profileSnapshot as CircleSession['profileSnapshot'],
          board: (data.board as AffinityBoard | null) ?? null,
          createdAt: toIsoString(data.createdAt),
          completedAt: toIsoString(data.completedAt) || null,
        };
      });

      sessions.sort((a, b) => a.createdAt.localeCompare(b.createdAt));

      const sections: string[] = [
        `# SEC Quality Audit — Full Check-in Transcripts & Affinity Boards`,
        `Exported: ${new Date().toISOString()}`,
        `Total sessions: ${sessions.length}`,
        '',
      ];

      sessions.forEach((s, idx) => {
        const key = `${s.userId}__${s.sessionId}`;
        const msgs = (msgsBySession.get(key) ?? []).sort((a, b) =>
          a.timestamp.localeCompare(b.timestamp)
        );
        const p = s.profileSnapshot;

        sections.push(`---`);
        sections.push(`## Session ${idx + 1}: ${s.board?.routine || s.sessionId}`);
        sections.push(`- **Status:** ${s.status}`);
        sections.push(`- **Started:** ${formatDateTime(s.createdAt)}`);
        if (s.completedAt) {
          sections.push(`- **Completed:** ${formatDateTime(s.completedAt)}`);
        }
        sections.push(`- **Profile (no email):** ${p.displayName} | ${p.roleCategory} | ${p.position} | ${p.department} | ${p.yearsInRole} yrs`);
        sections.push(`- **Job description:** ${p.jobDescription}`);
        sections.push('');
        sections.push(`### Transcript (${msgs.length} messages)`);
        if (msgs.length === 0) {
          sections.push('_No messages recorded._');
        } else {
          for (const m of msgs) {
            const speaker = m.role === 'user' ? p.displayName : 'Facilitator';
            sections.push(
              `- **[${formatDateTime(m.timestamp)}] ${speaker} (Topic ${m.topicNumber}):** ${m.content}`
            );
          }
        }
        sections.push('');

        if (s.board) {
          const b = s.board;
          sections.push(`### Affinity Board`);
          sections.push(`- **Routine:** ${b.routine} (${b.routineCode})`);
          sections.push(`- **Summary:** ${b.summary}`);
          sections.push('');
          sections.push(`#### Notes (${b.notes.length})`);
          b.notes.forEach((n, nIdx) => {
            sections.push(
              `${nIdx + 1}. **[${n.type}]** ${n.text} _(Quote: "${n.quote}"${n.source ? `, Source: ${n.source}` : ''}${n.code && n.code !== 'None' ? `, Code: ${n.code}` : ''})_`
            );
          });
          sections.push('');
          sections.push(`#### Themes (${b.themes.length})`);
          b.themes.forEach((t, tIdx) => {
            const isPri = b.priority.themeIndex === tIdx ? ' ★ Priority' : '';
            sections.push(
              `- **${t.title}${isPri}** (${t.heat}, Pain: ${t.painNotes}, Suggestions: ${t.suggestions}, Code: ${t.code})${t.cause ? ` — Cause: ${t.cause}` : ''}`
            );
          });
          sections.push('');
          if (b.priority.themeIndex !== null && b.themes[b.priority.themeIndex]) {
            sections.push(
              `#### Priority: ${b.themes[b.priority.themeIndex].title}`
            );
            sections.push(`- **Reason:** ${b.priority.reason}`);
            sections.push(`- **Sign of success:** ${b.priority.signOfSuccess}`);
            sections.push('');
          }
          sections.push(`#### Improvements (${b.improvements.length})`);
          b.improvements.forEach((imp, iIdx) => {
            sections.push(
              `${iIdx + 1}. **[${imp.origin}]** ${imp.idea} (Owner: ${imp.owner}, First step: ${imp.firstStep}, Code: ${imp.code})`
            );
          });
          sections.push('');
        }
      });

      const today = new Date().toISOString().slice(0, 10);
      triggerMarkdownDownload(`sec-quality-transcripts-${today}.md`, sections.join('\n'));
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : 'Could not export transcripts.';
      setErrorMsg(msg);
      onToastError(msg);
    } finally {
      setExportingTranscripts(false);
    }
  }

  const activeMarkdown = draftReport?.markdown ?? selectedReport?.markdown ?? null;
  const activeTitle =
    draftReport
      ? `Draft School-wide Report (${new Date().toISOString().slice(0, 10)})`
      : selectedReport?.title ?? '';

  return (
    <div className="space-y-6 fade-in-panel">
      <ConfirmDialog
        open={Boolean(deletingReport)}
        title="Delete saved report?"
        message={`Delete "${deletingReport?.title ?? ''}" from saved reports?`}
        confirmLabel="Delete report"
        danger={true}
        onConfirm={() => void handleDeleteReport()}
        onCancel={() => setDeletingReport(null)}
      />

      {/* Action bar */}
      <div className="sec-card p-5 md:p-6 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-800">
            School-wide Reports & Transcripts
          </h2>
          <p className="text-sm text-slate-600 mt-1">
            Synthesize all completed Affinity Boards into a school-wide TQM report, or export full session transcripts.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={() => void handleDownloadAllTranscripts()}
            disabled={exportingTranscripts}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-[#EADFCB] bg-white text-slate-800 text-sm font-semibold hover:bg-[#FBF7EF] disabled:opacity-50 cursor-pointer"
          >
            <Download className="w-4 h-4" />
            {exportingTranscripts ? 'Exporting…' : 'Download transcripts (.md)'}
          </button>

          <button
            type="button"
            onClick={() => void handleGenerateReport()}
            disabled={generating}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#F59E0B] text-[#1E293B] text-sm font-bold hover:bg-[#D97706] disabled:opacity-50 cursor-pointer"
          >
            <Sparkles className="w-4 h-4" />
            {generating ? 'Generating report…' : 'Generate School-wide Report'}
          </button>
        </div>
      </div>

      {errorMsg ? (
        <div className="sec-card p-4 bg-red-50 border-red-200 flex items-center gap-2 text-sm text-red-800">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      ) : null}

      {/* Report Viewer + Saved Reports Split */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_2fr] gap-6 items-start">
        <div className="sec-card p-5">
          <h3 className="text-base font-bold text-slate-800 mb-3">
            Saved Reports ({savedReports.length})
          </h3>
          {loadingReports ? (
            <p className="text-sm text-slate-500 py-4">Loading saved reports…</p>
          ) : savedReports.length === 0 ? (
            <div className="text-center py-6">
              <FileText className="w-7 h-7 text-slate-400 mx-auto" />
              <p className="mt-2 text-xs text-slate-500">
                No reports saved yet. Click &quot;Generate School-wide Report&quot; to create one.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {savedReports.map((rep) => {
                const isActive = !draftReport && selectedReport?.id === rep.id;
                return (
                  <div
                    key={rep.id}
                    className={`p-3 rounded-xl border transition-colors ${
                      isActive
                        ? 'bg-[#FFFBEB] border-[#F59E0B]'
                        : 'bg-[#FBF7EF]/60 border-[#EADFCB] hover:bg-[#FBF7EF]'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setDraftReport(null);
                          setSelectedReport(rep);
                        }}
                        className="text-left flex-1 cursor-pointer"
                      >
                        <div className="text-sm font-semibold text-slate-800">
                          {rep.title}
                        </div>
                        <div className="text-xs text-slate-500 mt-0.5 tabular-nums">
                          {formatDateShort(rep.createdAt)}
                        </div>
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeletingReport(rep)}
                        aria-label="Delete report"
                        className="p-1.5 rounded text-slate-400 hover:text-red-600 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="sec-card p-5 md:p-7">
          {!activeMarkdown ? (
            <div className="text-center py-12">
              <FileText className="w-9 h-9 text-slate-400 mx-auto" />
              <p className="mt-3 text-sm text-slate-600">
                Select a saved report on the left or click &quot;Generate School-wide Report&quot; above.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-[#EADFCB]">
                <div>
                  <h3 className="text-base font-bold text-slate-800">{activeTitle}</h3>
                  {draftReport ? (
                    <p className="text-xs text-amber-700 font-medium mt-0.5">
                      Preview — click &quot;Save Report&quot; to store it in /wallReports
                    </p>
                  ) : null}
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      triggerMarkdownDownload(
                        `${activeTitle.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.md`,
                        activeMarkdown
                      )
                    }
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-[#EADFCB] bg-[#FBF7EF] text-xs font-semibold text-slate-800 hover:bg-[#EFE6D2] cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Download .md
                  </button>

                  {draftReport ? (
                    <button
                      type="button"
                      onClick={() => void handleSaveReport()}
                      disabled={savingReport}
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#F59E0B] text-[#1E293B] text-xs font-bold hover:bg-[#D97706] disabled:opacity-50 cursor-pointer"
                    >
                      <Save className="w-3.5 h-3.5" />
                      {savingReport ? 'Saving…' : 'Save Report'}
                    </button>
                  ) : null}
                </div>
              </div>

              <div
                className="markdown-prose text-sm text-slate-800 leading-relaxed"
                dangerouslySetInnerHTML={{
                  __html: renderSafeMarkdown(activeMarkdown),
                }}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
