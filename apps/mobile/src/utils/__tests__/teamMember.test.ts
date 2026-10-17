import { memberName, memberEmail, memberInitial } from '../teamMember';

describe('teamMember helpers', () => {
  // Shape returned by GET /api/v1/teams/my-team and /teams/:id/members
  const apiMember = { userName: 'Mike Tane', userEmail: 'mike@example.test' };

  it('reads the API fields userName / userEmail', () => {
    expect(memberName(apiMember)).toBe('Mike Tane');
    expect(memberEmail(apiMember)).toBe('mike@example.test');
    expect(memberInitial(apiMember)).toBe('M');
  });

  it('regression: no name/email keys (API shape) no longer throws', () => {
    // Old code did (member.name || member.email)[0] -> TypeError on this shape.
    expect(() => memberInitial(apiMember)).not.toThrow();
  });

  it('falls back to the email initial when userName is null', () => {
    expect(memberInitial({ userName: null, userEmail: 'a@b.nz' })).toBe('A');
    expect(memberName({ userName: null, userEmail: 'a@b.nz' })).toBe('');
  });

  it('returns ? when there is no name or email', () => {
    expect(memberInitial({})).toBe('?');
    expect(memberInitial({ userName: '', userEmail: '' })).toBe('?');
  });

  it('tolerates a legacy name/email shape', () => {
    expect(memberName({ name: 'Old Shape' })).toBe('Old Shape');
    expect(memberEmail({ email: 'old@example.test' })).toBe('old@example.test');
  });

  it('prefers userName over legacy name', () => {
    expect(memberName({ userName: 'New', name: 'Old' })).toBe('New');
  });
});
