import React, { useEffect, useState } from 'react';
import { doc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore';
import {
  AlertCircle,
  Eye,
  FileText,
  Plus,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import type { BaselineDoc } from '../../shared/types';
import { db, stripUndefined, writeWithTimeout } from '../lib/firebase';
import { formatDateShort } from '../lib/formatters';
import { ConfirmDialog } from './NoteVisuals';

const MAX_FILE_BYTES = 200 * 1024; // 200 KB
const MAX_TOTAL_CHARS = 800_000;

function extractDocumentTitle(text: string, fallbackFileName: string): string {
  const lines = text.split(/\r?\n/);
  for (const line of lines) {
    if (/^#+\s+\S/.test(line)) {
      return line.replace(/^#+\s+/, '').trim().slice(0, 140);
    }
  }
  return fallbackFileName.slice(0, 140);
}

export function AdminBaselineView({
  onToastError,
}: {
  onToastError: (msg: string) => void;
}) {
  const [documents, setDocuments] = useState<BaselineDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [pasteTitle, setPasteTitle] = useState('');
  const [pasteText, setPasteText] = useState('');
  const [viewingDoc, setViewingDoc] = useState<BaselineDoc | null>(null);
  const [deletingDoc, setDeletingDoc] = useState<BaselineDoc | null>(null);

  useEffect(() => {
    const unsub = onSnapshot(
      doc(db, 'settings', 'companyBasis'),
      (snap) => {
        if (snap.exists()) {
          const data = snap.data();
          setDocuments(Array.isArray(data.documents) ? (data.documents as BaselineDoc[]) : []);
        } else {
          setDocuments([]);
        }
        setLoading(false);
      },
      (err) => {
        setLoading(false);
        onToastError(
          err instanceof Error ? err.message : 'Could not load baseline documents.'
        );
      }
    );
    return () => unsub();
  }, []);

  const totalChars = documents.reduce((sum, d) => sum + (d.sizeChars || d.text.length), 0);

  async function saveDocumentsList(nextDocs: BaselineDoc[]) {
    setSaving(true);
    setErrorMsg(null);
    try {
      await writeWithTimeout(() =>
        setDoc(
          doc(db, 'settings', 'companyBasis'),
          stripUndefined({
            documents: nextDocs,
            updatedAt: serverTimestamp(),
          })
        )
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not save baseline documents.';
      setErrorMsg(msg);
      onToastError(msg);
    } finally {
      setSaving(false);
    }
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    setErrorMsg(null);
    const files = Array.from(e.target.files ?? []);
    e.target.value = '';
    if (files.length === 0) return;

    const additions: BaselineDoc[] = [];
    let runningTotal = totalChars;

    for (const file of files) {
      const lowerName = file.name.toLowerCase();
      if (!lowerName.endsWith('.md') && !lowerName.endsWith('.txt')) {
        setErrorMsg(`"${file.name}" was refused. Only .md or .txt files are allowed.`);
        return;
      }
      if (file.size > MAX_FILE_BYTES) {
        setErrorMsg(`"${file.name}" exceeds the 200 KB per-file limit.`);
        return;
      }
      const rawText = await file.text();
      if (runningTotal + rawText.length > MAX_TOTAL_CHARS) {
        setErrorMsg(
          `Adding "${file.name}" would exceed the 800,000-character total baseline limit.`
        );
        return;
      }
      runningTotal += rawText.length;
      additions.push({
        id: crypto.randomUUID(),
        title: extractDocumentTitle(rawText, file.name),
        text: rawText,
        sizeChars: rawText.length,
        uploadedAt: new Date().toISOString(),
      });
    }

    await saveDocumentsList([...documents, ...additions]);
  }

  async function handlePasteSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg(null);

    const titleTrim = pasteTitle.trim();
    if (!titleTrim) {
      setErrorMsg('Please provide a title for the pasted document.');
      return;
    }
    if (!pasteText.trim()) {
      setErrorMsg('Please paste the document text.');
      return;
    }
    if (pasteText.length > MAX_FILE_BYTES) {
      setErrorMsg('Pasted text exceeds the 200 KB per-document limit.');
      return;
    }
    if (totalChars + pasteText.length > MAX_TOTAL_CHARS) {
      setErrorMsg('Adding this text would exceed the 800,000-character total baseline limit.');
      return;
    }

    const newDoc: BaselineDoc = {
      id: crypto.randomUUID(),
      title: titleTrim.slice(0, 140),
      text: pasteText,
      sizeChars: pasteText.length,
      uploadedAt: new Date().toISOString(),
    };

    await saveDocumentsList([...documents, newDoc]);
    setPasteTitle('');
    setPasteText('');
  }

  async function confirmDeleteDoc() {
    if (!deletingDoc) return;
    const next = documents.filter((d) => d.id !== deletingDoc.id);
    setDeletingDoc(null);
    await saveDocumentsList(next);
  }

  const usagePercent = Math.min(100, Math.round((totalChars / MAX_TOTAL_CHARS) * 100));

  return (
    <div className="space-y-6 fade-in-panel">
      <ConfirmDialog
        open={Boolean(deletingDoc)}
        title="Delete baseline document?"
        message={`Remove "${deletingDoc?.title ?? ''}" from SEC's quality baseline?`}
        confirmLabel="Delete document"
        danger={true}
        onConfirm={() => void confirmDeleteDoc()}
        onCancel={() => setDeletingDoc(null)}
      />

      {viewingDoc ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="sec-card max-w-3xl w-full max-h-[85vh] flex flex-col overflow-hidden">
            <div className="px-5 py-4 border-b border-[#EADFCB] flex items-center justify-between gap-3">
              <div>
                <h3 className="font-bold text-slate-800">{viewingDoc.title}</h3>
                <p className="text-xs text-slate-500 tabular-nums">
                  {viewingDoc.sizeChars.toLocaleString()} characters · Uploaded{' '}
                  {formatDateShort(viewingDoc.uploadedAt)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setViewingDoc(null)}
                aria-label="Close document"
                className="p-1.5 rounded-lg hover:bg-[#FBF7EF] text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <pre className="p-5 overflow-y-auto text-xs sm:text-sm font-mono whitespace-pre-wrap text-slate-800 bg-[#FBF7EF]/50 flex-1">
              {viewingDoc.text}
            </pre>
          </div>
        </div>
      ) : null}

      {/* Summary & Storage Bar */}
      <div className="sec-card p-5 md:p-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-slate-800">
              SEC Quality Baseline Documents
            </h2>
            <p className="text-sm text-slate-600 mt-1">
              Upload `.md` or `.txt` files (or paste text) containing SEC standards and codes
              such as CL-2, IN-1, AS-1, LR-1, QP-1, and FA-1.
            </p>
          </div>
          <div className="text-right shrink-0">
            <div className="text-xs font-semibold text-slate-600 tabular-nums">
              {totalChars.toLocaleString()} / {MAX_TOTAL_CHARS.toLocaleString()} characters
            </div>
            <div className="w-48 h-2.5 bg-[#EFE6D2] rounded-full overflow-hidden mt-1.5 ml-auto">
              <div
                className="h-full bg-[#F59E0B]"
                style={{ width: `${usagePercent}%` }}
              />
            </div>
          </div>
        </div>

        {errorMsg ? (
          <div className="mt-4 p-3 rounded-xl bg-red-50 border border-red-200 flex items-center gap-2 text-sm text-red-800">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        ) : null}
      </div>

      {/* Upload & Paste Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="sec-card p-5 md:p-6 flex flex-col justify-between">
          <div>
            <h3 className="text-base font-bold text-slate-800">Upload .md or .txt file</h3>
            <p className="text-xs text-slate-600 mt-1">
              Maximum 200 KB per file. Document title comes from the first `#` heading (or filename).
            </p>
          </div>

          <label className="mt-5 border-2 border-dashed border-[#D4BC94] rounded-xl p-6 text-center bg-[#FBF7EF] hover:bg-[#FEF3C7]/40 transition-colors cursor-pointer block">
            <Upload className="w-7 h-7 text-amber-700 mx-auto" />
            <span className="mt-2 block text-sm font-semibold text-slate-800">
              {saving ? 'Uploading…' : 'Choose .md or .txt files'}
            </span>
            <span className="mt-1 block text-xs text-slate-500">
              Text is stored verbatim for the Facilitator and Affinity Boards
            </span>
            <input
              type="file"
              accept=".md,.txt,text/markdown,text/plain"
              multiple
              disabled={saving}
              onChange={(e) => void handleFileUpload(e)}
              className="sr-only"
            />
          </label>
        </div>

        <form onSubmit={(e) => void handlePasteSubmit(e)} className="sec-card p-5 md:p-6 space-y-3.5">
          <h3 className="text-base font-bold text-slate-800">Or paste baseline text</h3>
          <div>
            <label htmlFor="paste-title" className="block text-xs font-semibold text-slate-700 mb-1">
              Document title
            </label>
            <input
              id="paste-title"
              type="text"
              maxLength={140}
              value={pasteTitle}
              onChange={(e) => setPasteTitle(e.target.value)}
              placeholder="e.g., Computer Laboratory Standards (CL)"
              className="w-full px-3 py-2 rounded-lg border border-[#EADFCB] text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#F59E0B]"
            />
          </div>
          <div>
            <label htmlFor="paste-body" className="block text-xs font-semibold text-slate-700 mb-1">
              Baseline text
            </label>
            <textarea
              id="paste-body"
              rows={4}
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
              placeholder="Paste standards and baseline codes here..."
              className="w-full px-3 py-2 rounded-lg border border-[#EADFCB] text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#F59E0B]"
            />
          </div>
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#F59E0B] text-[#1E293B] text-sm font-bold hover:bg-[#D97706] disabled:opacity-50 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              Add baseline text
            </button>
          </div>
        </form>
      </div>

      {/* Saved Documents List */}
      <div className="sec-card p-5 md:p-6">
        <h3 className="text-base font-bold text-slate-800 mb-4">
          Uploaded Baseline Documents ({documents.length})
        </h3>
        {loading ? (
          <p className="text-sm text-slate-500 py-6 text-center">Loading baseline…</p>
        ) : documents.length === 0 ? (
          <div className="text-center py-8">
            <FileText className="w-8 h-8 text-slate-400 mx-auto" />
            <p className="mt-2 text-sm text-slate-600">
              No baseline documents uploaded yet. Upload a .md or .txt file above to get started.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-[#EADFCB]">
            {documents.map((d) => (
              <div
                key={d.id}
                className="py-3.5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"
              >
                <div>
                  <div className="font-semibold text-sm text-slate-800">{d.title}</div>
                  <div className="text-xs text-slate-500 tabular-nums mt-0.5">
                    {d.sizeChars.toLocaleString()} characters · Uploaded{' '}
                    {formatDateShort(d.uploadedAt)}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => setViewingDoc(d)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#EADFCB] text-xs font-semibold text-slate-700 hover:bg-[#FBF7EF] cursor-pointer"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    View
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeletingDoc(d)}
                    disabled={saving}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-red-200 text-xs font-semibold text-red-700 hover:bg-red-50 cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
