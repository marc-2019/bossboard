import { redactRequestPath } from '../utils/redact-request-path.js';

describe('redactRequestPath', () => {
  it.each([
    ['/api/v1/teams/invites/secret-code', '/api/v1/teams/invites/[redacted]'],
    ['/invite/secret-code/accept', '/invite/[redacted]/accept'],
    ['/invites/encoded%2Fcode?token=secret', '/invites/[redacted]'],
    ['/teams/team-1/invites/id', '/teams/team-1/invites/[redacted]'],
    ['/teams', '/teams'],
    ['/invites', '/invites'],
  ])('redacts %s', (path, expected) => {
    expect(redactRequestPath(path)).toBe(expected);
  });
});
