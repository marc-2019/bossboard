'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Card } from '@/components/ui/card';
import {
  certificationsClient,
  ApiError,
  type CreateCertificationInput,
} from '@/lib/api-client';
import { CertForm, type CertFormInitial, toDateInput } from '../../cert-form';

export default function EditCertificationPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = params.id;

  const [initial, setInitial] = useState<CertFormInitial | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    certificationsClient
      .get(id)
      .then((data) => {
        if (cancelled) return;
        const c = data.certification;
        setInitial({
          type: c.type,
          name: c.name ?? '',
          certNumber: c.certNumber ?? '',
          issuingBody: c.issuingBody ?? '',
          issueDate: toDateInput(c.issueDate),
          expiryDate: toDateInput(c.expiryDate),
        });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(
          err instanceof ApiError ? err.message : 'Could not load certification.',
        );
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  const handleSubmit = async (payload: CreateCertificationInput) => {
    await certificationsClient.update(id, payload);
    router.push('/certifications');
  };

  if (error) {
    return (
      <div className="max-w-3xl">
        <Card>
          <p className="text-sm text-danger">{error}</p>
        </Card>
      </div>
    );
  }

  if (!initial) {
    return (
      <div className="max-w-3xl">
        <Card>
          <p className="text-sm text-gray-500 py-8 text-center">Loading certification…</p>
        </Card>
      </div>
    );
  }

  return (
    <CertForm
      heading="Edit certification"
      submitLabel="Save changes"
      initial={initial}
      onSubmit={handleSubmit}
    />
  );
}
