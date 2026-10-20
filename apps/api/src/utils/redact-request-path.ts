/** Remove invite identifiers and query strings before logging request paths. */
export function redactRequestPath(path: string): string {
  return path.split(/[?#]/, 1)[0].replace(/(\/invites?\/)[^/]+/gi, '$1[redacted]');
}
