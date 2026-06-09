'use client';

import { useRouter } from 'next/navigation';
import { certificationsClient, type CreateCertificationInput } from '@/lib/api-client';
import { CertForm, emptyCertForm } from '../cert-form';

export default function NewCertificationPage() {
  const router = useRouter();

  const handleSubmit = async (payload: CreateCertificationInput) => {
    await certificationsClient.create(payload);
    router.push('/certifications');
  };

  return (
    <CertForm
      heading="Add certification"
      submitLabel="Add certification"
      initial={emptyCertForm}
      onSubmit={handleSubmit}
    />
  );
}
