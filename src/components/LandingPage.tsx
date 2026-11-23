import React from 'react';
import { NOTE_META, NoteTypeIcon } from './NoteVisuals';
import { NOTE_TYPES } from '../../shared/types';

export function LandingPage({
  onSignIn,
  signingIn,
  authError,
}: {
  onSignIn: () => void;
  signingIn: boolean;
  authError: string | null;
}) {
  return (
    <div className="max-w-[1200px] mx-auto px-4 sm:px-6 py-8 md:py-14">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-stretch">
        {/* Left: Cork Board Decoration with 5 sticky notes */}
        <div className="cork-board rounded-[14px] p-6 md:p-8 flex flex-col justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-700 mb-4">
              How an Affinity Board works
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {NOTE_TYPES.map((type, idx) => {
                const meta = NOTE_META[type];
                const tilt =
                  idx % 3 === 0
                    ? 'sticky-tilt-left'
                    : idx % 3 === 1
                    ? 'sticky-tilt-right'
                    : 'sticky-tilt-slight';
                return (
                  <div
                    key={type}
                    className={`sticky-note-card ${tilt} rounded-lg p-3.5 ${
                      idx === 4 ? 'sm:col-span-2 sm:max-w-xs' : ''
                    }`}
                    style={{
                      backgroundColor: meta.bg,
                      border: `1px solid ${meta.border}`,
                      color: meta.text,
                    }}
                  >
                    <div className="flex items-center gap-1.5 text-xs font-bold mb-1">
                      <NoteTypeIcon type={type} className="w-3.5 h-3.5" />
                      <span>{meta.label}</span>
                    </div>
                    <p className="font-sticky text-[18px] leading-snug">
                      {meta.meaning}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
          <p className="mt-6 text-xs text-slate-700 font-medium">
            Surigao Education Center · Quality Circle KJ Method
          </p>
        </div>

        {/* Right: App intro, 3 steps, Sign in with Google */}
        <div className="sec-card p-6 md:p-10 flex flex-col justify-center">
          <h1 className="text-3xl md:text-4xl font-bold text-slate-800 tracking-tight leading-tight">
            SEC Quality Audit
          </h1>
          <p className="mt-3 text-base text-slate-600 leading-relaxed">
            Share what makes your weekly school routines hard, what people raise,
            and what already works in a short guided kumustahan.
          </p>

          <div className="mt-8 space-y-4">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              How it works
            </h2>
            <ol className="space-y-3">
              {[
                {
                  num: '1',
                  title: 'Tell us one routine',
                  desc: 'Pick a weekly teaching, library, or school support routine.',
                },
                {
                  num: '2',
                  title: 'Answer 6 short questions',
                  desc: 'Reply in English, Filipino, or Bisaya at your own pace.',
                },
                {
                  num: '3',
                  title: 'Get your Affinity Board',
                  desc: 'Review your grouped notes, star your priority, and save.',
                },
              ].map((step) => (
                <li
                  key={step.num}
                  className="flex items-start gap-3.5 p-3 rounded-xl bg-[#FBF7EF] border border-[#EADFCB]"
                >
                  <span className="w-7 h-7 rounded-full bg-[#F59E0B] text-[#1E293B] font-bold text-sm flex items-center justify-center shrink-0 tabular-nums">
                    {step.num}
                  </span>
                  <div>
                    <div className="text-sm font-bold text-slate-800">{step.title}</div>
                    <div className="text-xs text-slate-600 mt-0.5">{step.desc}</div>
                  </div>
                </li>
              ))}
            </ol>
          </div>

          {authError ? (
            <div className="mt-6 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
              {authError}
            </div>
          ) : null}

          <div className="mt-8">
            <button
              type="button"
              onClick={onSignIn}
              disabled={signingIn}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2.5 px-6 py-3 rounded-xl bg-[#F59E0B] text-[#1E293B] font-bold text-sm hover:bg-[#D97706] transition-colors disabled:opacity-60 cursor-pointer"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" aria-hidden="true">
                <path
                  fill="currentColor"
                  d="M21.35 11.1h-9.17v2.73h6.51c-.33 3.81-3.5 5.44-6.5 5.44C8.36 19.27 5 16.25 5 12c0-4.1 3.2-7.27 7.2-7.27 3.09 0 4.9 1.97 4.9 1.97L19 4.72S16.56 2 12.1 2C6.42 2 2.03 6.8 2.03 12c0 5.05 4.13 10 10.22 10 5.35 0 9.25-3.67 9.25-9.09 0-1.15-.15-1.81-.15-1.81Z"
                />
              </svg>
              {signingIn ? 'Signing in…' : 'Sign in with Google'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
