'use client';

import { useState } from 'react';
import { usePathname } from 'next/navigation';
import { MessageSquarePlus, Star, X } from 'lucide-react';
import type { FeedbackCategory } from '@bossboard/shared';
import { feedbackClient, ApiError } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import pkg from '../../../package.json';

const CATEGORIES: { value: FeedbackCategory; label: string }[] = [
  { value: 'bug', label: "Something's broken" },
  { value: 'idea', label: 'An idea' },
  { value: 'other', label: 'Other' },
];

/**
 * Sidebar feedback affordance: a nav-style button that opens a minimal
 * modal posting to POST /api/v1/feedback (via the Next.js proxy route).
 */
export function FeedbackButton() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState<FeedbackCategory>('bug');
  const [rating, setRating] = useState<number | null>(null);
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setCategory('bug');
    setRating(null);
    setMessage('');
    setSent(false);
    setError(null);
  }

  function close() {
    setOpen(false);
    reset();
  }

  async function handleSubmit() {
    if (!message.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      await feedbackClient.submit({
        category,
        message: message.trim(),
        ...(rating ? { rating } : {}),
        pageContext: pathname,
        appVersion: `web-${pkg.version}`,
      });
      setSent(true);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : 'Could not send feedback. Please try again.',
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors text-gray-300 hover:text-white hover:bg-white/10"
      >
        <MessageSquarePlus size={18} />
        Send feedback
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={close} />
          <div className="relative bg-white rounded-xl shadow-xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900">Send feedback</h2>
              <button
                onClick={close}
                className="p-1 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100"
                aria-label="Close"
              >
                <X size={18} />
              </button>
            </div>

            {sent ? (
              <div className="space-y-4 text-center">
                <p className="text-base font-semibold text-gray-900">Thanks — we got it</p>
                <p className="text-sm text-gray-600">
                  Your message is with the team. You can keep using the app as usual.
                </p>
                <Button onClick={close} className="w-full">
                  Done
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex flex-wrap gap-2">
                  {CATEGORIES.map((c) => (
                    <button
                      key={c.value}
                      type="button"
                      onClick={() => setCategory(c.value)}
                      className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-colors ${
                        category === c.value
                          ? 'bg-accent text-white border-accent'
                          : 'bg-white text-gray-700 border-gray-300 hover:border-gray-400'
                      }`}
                    >
                      {c.label}
                    </button>
                  ))}
                </div>

                <div>
                  <label htmlFor="feedback-message" className="block text-sm font-medium text-gray-700 mb-1">
                    What happened, or what would help?
                  </label>
                  <textarea
                    id="feedback-message"
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    rows={4}
                    maxLength={5000}
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 text-gray-900 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent transition-colors resize-none"
                    placeholder="The more detail, the better."
                  />
                </div>

                <div>
                  <p className="text-sm font-medium text-gray-700 mb-1">
                    Rate BossBoard so far <span className="font-normal text-gray-400">(optional)</span>
                  </p>
                  <div className="flex gap-1">
                    {[1, 2, 3, 4, 5].map((n) => (
                      <button
                        key={n}
                        type="button"
                        onClick={() => setRating(rating === n ? null : n)}
                        className="p-1 text-gray-300 hover:text-amber-400 transition-colors"
                        aria-label={`${n} out of 5`}
                      >
                        <Star
                          size={22}
                          className={rating !== null && n <= rating ? 'text-amber-400' : ''}
                          fill={rating !== null && n <= rating ? 'currentColor' : 'none'}
                        />
                      </button>
                    ))}
                  </div>
                </div>

                {error && <p className="text-sm text-danger">{error}</p>}

                <Button
                  onClick={handleSubmit}
                  loading={submitting}
                  disabled={!message.trim()}
                  className="w-full"
                >
                  Send
                </Button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
