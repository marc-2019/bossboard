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

/**
 * Westpac NZ Business Online Accounts CSV — mapped path only (vd-bb-bank-westpac).
 * Header names from Westpac “Import & Export (Download) Formats” guide,
 * CSV Format (Accounts): Date, Amount, Other Party Name, Description, Particulars,
 * Analysis Code, Reference, Transaction Notes.
 * https://assets.dam.westpac.co.nz/is/content/wnzl/dist/ways-to-bank/digital/business-online/Business-Online_Transaction-Import-and-Export-File-Formats_guide.pdf
 * Operator map — not bank-brand detect. Fixture amounts only.
 */
const WESTPAC_ACCOUNTS_CSV = `Date,Amount,Other Party Name,Description,Particulars,Analysis Code,Reference,Transaction Notes
13/03/2026,-12.50,Fixture Paint Co,EFTPOS,INV-FIX,AP,REF-001,Fixture note
25/03/2026,88.00,Fixture Client Ltd,CREDIT,DEP,DC,INV-FIX,Fixture credit`;

describe('mapped spreadsheet (Westpac Business Online Accounts CSV headers)', () => {
  it('returns the PDF Accounts CSV field names for the operator to map', () => {
    const table = parseSpreadsheet(WESTPAC_ACCOUNTS_CSV, 'westpac-accounts-fixture.csv');
    expect(table.headers).toEqual([
      'Date',
      'Amount',
      'Other Party Name',
      'Description',
      'Particulars',
      'Analysis Code',
      'Reference',
      'Transaction Notes',
    ]);
    expect(table.rows).toHaveLength(2);
  });

  it('maps Other Party Name as Description (operator choice; reconciliation-friendly)', () => {
    const rows = parseMappedSpreadsheet(WESTPAC_ACCOUNTS_CSV, 'westpac-accounts-fixture.csv', {
      date: 'Date',
      amount: 'Amount',
      description: 'Other Party Name',
    });
    expect(rows).toEqual([
      { date: '2026-03-13', amount: -1250, description: 'Fixture Paint Co' },
      { date: '2026-03-25', amount: 8800, description: 'Fixture Client Ltd' },
    ]);
  });

  it('maps the Description column when the operator chooses that header instead', () => {
    const rows = parseMappedSpreadsheet(WESTPAC_ACCOUNTS_CSV, 'westpac-accounts-fixture.csv', {
      date: 'Date',
      amount: 'Amount',
      description: 'Description',
    });
    expect(rows).toEqual([
      { date: '2026-03-13', amount: -1250, description: 'EFTPOS' },
      { date: '2026-03-25', amount: 8800, description: 'CREDIT' },
    ]);
  });

  it('normalizes Westpac dd/mm/yyyy dates (day > 12) via existing normalizeDate', () => {
    const rows = parseMappedSpreadsheet(WESTPAC_ACCOUNTS_CSV, 'westpac-accounts-fixture.csv', {
      date: 'Date',
      amount: 'Amount',
      description: 'Other Party Name',
    });
    expect(rows.map((r) => r.date)).toEqual(['2026-03-13', '2026-03-25']);
  });

  it('treats leading-minus Amount as a debit, matching the Westpac Accounts format note', () => {
    const rows = parseMappedSpreadsheet(WESTPAC_ACCOUNTS_CSV, 'westpac-accounts-fixture.csv', {
      date: 'Date',
      amount: 'Amount',
      description: 'Other Party Name',
    });
    expect(rows[0].amount).toBe(-1250);
    expect(rows[1].amount).toBe(8800);
  });

  it('strips a UTF-8 BOM and still matches the operator map', () => {
    const withBom = `\uFEFF${WESTPAC_ACCOUNTS_CSV}`;
    const rows = parseMappedSpreadsheet(withBom, 'westpac-accounts-fixture.csv', {
      date: 'Date',
      amount: 'Amount',
      description: 'Other Party Name',
    });
    expect(rows).toHaveLength(2);
    expect(rows[0].description).toBe('Fixture Paint Co');
  });
});
