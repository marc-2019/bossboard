/**
 * Fixture-only mapped spreadsheet tests. Amounts here are fixtures, not live customer amounts.
 */
import { applyColumnMap, parseMappedSpreadsheet, parseSpreadsheet } from '../../services/mapped-spreadsheet.js';

const GENERIC_CSV = `Date,Amount,Description
2026-03-02,12.50,Fixture paint
03/03/2026,-4.00,Fixture coffee`;

const SHUFFLED_CSV = `Memo,Value,When
Fixture hire,88.00,2026-03-04
Fixture refund,-10.00,05/03/2026`;

describe('mapped spreadsheet (generic Date / Amount / Description)', () => {
  it('parses a generic three-column CSV using an operator map', () => {
    const rows = parseMappedSpreadsheet(GENERIC_CSV, 'fixture.csv', {
      date: 'Date',
      amount: 'Amount',
      description: 'Description',
    });
    expect(rows).toEqual([
      { date: '2026-03-02', amount: 1250, description: 'Fixture paint' },
      { date: '2026-03-03', amount: -400, description: 'Fixture coffee' },
    ]);
  });

  it('uses the operator map, not header-name detect, on shuffled columns', () => {
    const rows = parseMappedSpreadsheet(SHUFFLED_CSV, 'fixture.csv', {
      date: 'When',
      amount: 'Value',
      description: 'Memo',
    });
    expect(rows).toEqual([
      { date: '2026-03-04', amount: 8800, description: 'Fixture hire' },
      { date: '2026-03-05', amount: -1000, description: 'Fixture refund' },
    ]);
  });

  it('rejects a map that does not match file headers', () => {
    expect(() =>
      parseMappedSpreadsheet(GENERIC_CSV, 'fixture.csv', {
        date: 'Txn Date',
        amount: 'Amount',
        description: 'Description',
      })
    ).toThrow(/Map Date, Amount, and Description/);
  });

  it('returns headers for the operator to map', () => {
    const table = parseSpreadsheet(GENERIC_CSV, 'fixture.csv');
    expect(table.headers).toEqual(['Date', 'Amount', 'Description']);
    expect(table.rows).toHaveLength(2);
  });

  it('skips fixture rows with a bad amount', () => {
    const table = parseSpreadsheet(
      `Date,Amount,Description\n2026-03-06,not-a-number,Fixture skip\n2026-03-07,1.00,Fixture keep`,
      'fixture.csv'
    );
    const rows = applyColumnMap(table, {
      date: 'Date',
      amount: 'Amount',
      description: 'Description',
    });
    expect(rows).toEqual([{ date: '2026-03-07', amount: 100, description: 'Fixture keep' }]);
  });
});
