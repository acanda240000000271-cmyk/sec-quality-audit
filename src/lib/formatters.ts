import DOMPurify from 'dompurify';
import { marked } from 'marked';
import { type InteractionMessage, TOPICS } from '../../shared/types';

export function isClosingFacilitatorMessage(
  messages: Pick<InteractionMessage, 'role'>[],
  index: number
): boolean {
  const target = messages[index];
  if (!target || target.role !== 'assistant') return false;
  let userCountBefore = 0;
  for (let i = 0; i < index; i += 1) {
    if (messages[i].role === 'user') userCountBefore += 1;
  }
  return userCountBefore >= 6;
}

export function getFacilitatorMessageLabel(
  messages: Pick<InteractionMessage, 'role' | 'topicNumber'>[],
  index: number,
  options?: { includeTopicName?: boolean; prefix?: string }
): string {
  if (isClosingFacilitatorMessage(messages, index)) {
    return options?.prefix ? `${options.prefix}Closing` : 'Closing';
  }
  const msg = messages[index];
  const topicNum = msg?.topicNumber ?? 1;
  const base = options?.includeTopicName
    ? `Topic ${topicNum} · ${TOPICS[topicNum - 1]?.name ?? 'Routine'}`
    : `Topic ${topicNum}`;
  return options?.prefix ? `${options.prefix}${base}` : base;
}

export function toTitleCaseFirstName(displayName: string | null | undefined): string {
  const clean = (displayName ?? '').trim();
  if (!clean) return 'Colleague';
  const firstToken = clean.split(/\s+/)[0] || clean;
  return firstToken.charAt(0).toUpperCase() + firstToken.slice(1).toLowerCase();
}

export function getLocalGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

export function formatTodayLabel(): string {
  return new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

export function formatDateShort(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function formatTimeShort(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function escapeRawHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export function renderSafeMarkdown(markdownText: string): string {
  const escapedInput = escapeRawHtml(markdownText || '');
  const rawHtml = marked.parse(escapedInput, {
    async: false,
    gfm: true,
    breaks: true,
  }) as string;

  return DOMPurify.sanitize(rawHtml, {
    ALLOWED_TAGS: [
      'p',
      'br',
      'strong',
      'em',
      'b',
      'i',
      'u',
      'ul',
      'ol',
      'li',
      'h1',
      'h2',
      'h3',
      'h4',
      'blockquote',
      'code',
      'pre',
      'table',
      'thead',
      'tbody',
      'tr',
      'th',
      'td',
      'a',
      'hr',
    ],
    ALLOWED_ATTR: ['href', 'target', 'rel'],
    ALLOWED_URI_REGEXP: /^(?:https?|mailto):/i,
  });
}

export function buildWelcomeMessage(firstName: string): string {
  return `Hi ${firstName}! Welcome to your Quality Circle kumustahan. I'm the Facilitator. In 6 short questions we will look at one routine in your work: what makes it hard, what people complain about, what already works and what you would change. Short answers are fine, in English, Filipino or Bisaya. Question 1: Which routine takes up much of your week (for example a computer lab class, checking and recording grades, preparing materials or lending books), and what are its main steps?`;
}
