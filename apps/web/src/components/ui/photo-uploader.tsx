'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Camera, Upload, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { photosClient, ApiError } from '@/lib/api-client';
import type { Photo, PhotoEntityType } from '@bossboard/shared';

interface PhotoUploaderProps {
  entityType: PhotoEntityType;
  entityId: string;
}

/**
 * Reusable photo attachments component for entity detail pages.
 *
 * Renders a thumbnail grid of photos already attached to the entity plus an
 * "Add photo" button that triggers a hidden <input type="file">. Uploads go
 * through photosClient.upload (multipart/form-data); the grid re-fetches via
 * photosClient.listByEntity. Each thumbnail has a delete (×) overlay backed by
 * photosClient.remove. Mirrors the mobile PhotoAttachments UX.
 */
export function PhotoUploader({ entityType, entityId }: PhotoUploaderProps) {
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const loadPhotos = useCallback(async () => {
    try {
      const data = await photosClient.listByEntity(entityType, entityId);
      setPhotos(data.photos ?? []);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : 'Could not load photos.',
      );
    } finally {
      setLoading(false);
    }
  }, [entityType, entityId]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    photosClient
      .listByEntity(entityType, entityId)
      .then((data) => {
        if (!cancelled) setPhotos(data.photos ?? []);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(
            err instanceof ApiError ? err.message : 'Could not load photos.',
          );
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [entityType, entityId]);

  const onPickFile = () => {
    if (uploading) return;
    setError(null);
    inputRef.current?.click();
  };

  const onFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // Reset the input so selecting the same file again re-fires onChange.
    e.target.value = '';
    if (!file) return;

    setUploading(true);
    setError(null);
    try {
      await photosClient.upload(file, entityType, entityId);
      await loadPhotos();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Upload failed.');
    } finally {
      setUploading(false);
    }
  };

  const onDelete = async (id: string) => {
    if (deletingId) return;
    if (!window.confirm('Remove this photo?')) return;
    setDeletingId(id);
    setError(null);
    try {
      await photosClient.remove(id);
      setPhotos((prev) => prev.filter((p) => p.id !== id));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not delete photo.');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
          Photos{!loading && photos.length > 0 ? ` (${photos.length})` : ''}
        </h2>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={onPickFile}
          loading={uploading}
          disabled={uploading}
        >
          {!uploading && <Camera size={14} className="mr-2" />}
          Add photo
        </Button>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={onFileSelected}
      />

      {error && (
        <div className="mb-3 p-3 rounded-lg bg-danger-light text-danger text-sm">
          {error}
        </div>
      )}

      {loading ? (
        <p className="text-sm text-gray-500 py-6 text-center">Loading photos…</p>
      ) : photos.length === 0 ? (
        <button
          type="button"
          onClick={onPickFile}
          disabled={uploading}
          className="w-full flex flex-col items-center justify-center gap-2 py-8 rounded-lg border border-dashed border-border text-gray-400 hover:text-gray-600 hover:border-gray-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Upload size={28} />
          <span className="text-sm">Click to add photos</span>
        </button>
      ) : (
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3">
          {photos.map((photo) => (
            <div
              key={photo.id}
              className="relative group aspect-square rounded-lg overflow-hidden bg-gray-100 border border-border-light"
            >
              <a
                href={photosClient.fileUrl(photo.id)}
                target="_blank"
                rel="noopener noreferrer"
                title={photo.caption ?? photo.originalFilename ?? 'Photo'}
              >
                {/* Raw <img>, not next/image: bytes come from an auth-cookie-gated
                    proxy route, so Next's image optimizer can't fetch them. */}
                <img
                  src={photosClient.fileUrl(photo.id)}
                  alt={photo.caption ?? photo.originalFilename ?? 'Attached photo'}
                  className="w-full h-full object-cover"
                />
              </a>
              <button
                type="button"
                onClick={() => onDelete(photo.id)}
                disabled={deletingId === photo.id}
                aria-label="Delete photo"
                className="absolute top-1 right-1 inline-flex items-center justify-center h-6 w-6 rounded-full bg-black/60 text-white opacity-0 group-hover:opacity-100 focus:opacity-100 hover:bg-danger transition-opacity disabled:opacity-50"
              >
                <X size={14} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
