import path from 'path';
import { isPathInside } from '../../utils/path-safe.js';

describe('isPathInside', () => {
  const root = path.resolve('/app/uploads/photos');

  it('allows files under the root', () => {
    expect(isPathInside(root, path.join(root, 'abc.jpg'))).toBe(true);
  });

  it('allows the root itself', () => {
    expect(isPathInside(root, root)).toBe(true);
  });

  it('rejects sibling prefix bypass (photos_evil)', () => {
    const evil = path.resolve('/app/uploads/photos_evil/secret.txt');
    expect(isPathInside(root, evil)).toBe(false);
  });

  it('rejects parent traversal', () => {
    expect(isPathInside(root, path.resolve(root, '..', 'documents', 'x.pdf'))).toBe(false);
  });
});
