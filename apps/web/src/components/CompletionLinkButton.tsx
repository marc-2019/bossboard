'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Link as LinkIcon, ExternalLink } from 'lucide-react';

interface CompletionLinkButtonProps {
  jobLogId: string;
  description?: string;
  status?: string;
}

/**
 * CompletionLinkButton
 *
 * Fetches the public client job completion link via the (new) API endpoint
 * and provides actions: copy link, open public view.
 *
 * For payment flow (related to Stripe public invoice pattern): the public job
 * completion view can later embed a Stripe "Pay" button using the same
 * getOrCreate pattern. This button surfaces the link that client uses.
 * Reuses web's proxy + auth + ui/Button.
 */
export function CompletionLinkButton({ jobLogId, status }: CompletionLinkButtonProps) {
  const [loading, setLoading] = useState(false);
  const [link, setLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const fetchLink = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/job-logs/${jobLogId}/completion-link`, {
        method: 'POST',
      });
      const data = await res.json();
      if (data.success && data.data?.link) {
        setLink(data.data.link);
      } else {
        alert(data.message || 'Could not get link');
      }
    } catch {
      alert('Failed to fetch completion link');
    } finally {
      setLoading(false);
    }
  };

  const copy = async () => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // fallback
      prompt('Copy this link:', link);
    }
  };

  const openClientView = () => {
    if (link) window.open(link, '_blank', 'noopener,noreferrer');
  };

  // Only meaningful for completed; still render for others (server may allow)
  const isCompleted = status === 'completed';

  if (!link) {
    return (
      <Button
        variant="ghost"
        size="sm"
        onClick={fetchLink}
        disabled={loading}
        title={isCompleted ? 'Get client completion link' : 'Get link to job (will be public once completed)'}
      >
        <LinkIcon className="h-4 w-4 mr-1" />
        {loading ? '...' : 'Client link'}
      </Button>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <Button variant="ghost" size="sm" onClick={copy}>
        {copied ? 'Copied!' : 'Copy link'}
      </Button>
      <Button variant="primary" size="sm" onClick={openClientView}>
        <ExternalLink className="h-4 w-4 mr-1" />
        View as client
      </Button>
    </div>
  );
}

export default CompletionLinkButton;
