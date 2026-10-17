import { memberName, memberEmail, memberInitial } from '../teamMember';

describe('teamMember helpers', () => {
  // Shape returned by GET /api/v1/teams/my-team and /teams/:id/members
  const apiMember = { userName: 'Mike Tane', userEmail: 'mike@example.test' };

  it('reads the API fields userName / userEmail', () => {
    expect(memberName(apiMember)).toBe('Mike Tane');
    expect(memberEmail(apiMember)).toBe('mike@example.test');
    expect(memberInitial(apiMember)).toBe('M');
  });

  it('regression: rows the old expression crashed on now yield strings and an initial', () => {
    // The pre-fix screen did (member.name || member.email)[0]. API rows carry no
    // name/email keys and userName/userEmail are nullable, so that threw a TypeError.
    const oldInitial = (m: { name?: string; email?: string }) => (m.name || m.email)![0];
    const rows = [
      { userName: 'Mike Tane', userEmail: 'mike@example.test' },
      { userName: null, userEmail: 'invitee@example.test' },
      { userName: null, userEmail: null },
    ];
    for (const row of rows) {
      expect(() => oldInitial(row as { name?: string; email?: string })).toThrow(TypeError);
      expect(typeof memberName(row)).toBe('string');
      expect(typeof memberEmail(row)).toBe('string');
    }
    expect(rows.map(memberInitial)).toEqual(['M', 'I', '?']);
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
