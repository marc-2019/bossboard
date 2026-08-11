/**
 * Path containment helpers — avoid classic startsWith bypass
 * (e.g. /uploads/photos_evil matching prefix /uploads/photos).
 */

import path from 'path';

/** True if `candidate` resolves to `root` or a file/dir strictly under it. */
export function isPathInside(root: string, candidate: string): boolean {
  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(candidate);
  if (resolved === resolvedRoot) return true;
  const prefix = resolvedRoot.endsWith(path.sep) ? resolvedRoot : resolvedRoot + path.sep;
  return resolved.startsWith(prefix);
}
