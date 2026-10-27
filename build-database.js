// MSAI-5523 Module 2: Build library.db from schema.sql and books.csv.
// The original books.csv is read only, never modified.
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

const DIR = __dirname;
const DB_PATH = path.join(DIR, 'library.db');
const BOOKS_TO_IMPORT = 25;

// Minimal CSV parser that handles quoted fields containing commas.
function parseCsv(text) {
  const rows = [];
  let row = [], field = '', inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.length > 1 || row[0] !== '') rows.push(row);
      row = [];
    } else field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows;
}

if (fs.existsSync(DB_PATH)) fs.unlinkSync(DB_PATH);
const db = new DatabaseSync(DB_PATH);
db.exec(fs.readFileSync(path.join(DIR, 'schema.sql'), 'utf8'));

// ---- Import books and authors from the CSV (decision: first 25 books) ----
const csvRows = parseCsv(fs.readFileSync(path.join(DIR, 'books.csv'), 'utf8'));
const header = csvRows[0];
const col = (name) => header.indexOf(name);
const iBookId = col('book_id'), iIsbn = col('isbn'),
      iAuthors = col('authors'), iYear = col('original_publication_year'),
      iTitle = col('title');

const insBook = db.prepare(
  'INSERT INTO books (book_id, title, isbn, publication_year) VALUES (?,?,?,?)');
const insAuthor = db.prepare(
  'INSERT INTO authors (name) VALUES (?) ON CONFLICT(name) DO NOTHING');
const getAuthor = db.prepare('SELECT author_id FROM authors WHERE name = ?');
const insBA = db.prepare(
  'INSERT INTO book_authors (book_id, author_id) VALUES (?,?)');

db.exec('BEGIN');
for (const r of csvRows.slice(1, 1 + BOOKS_TO_IMPORT)) {
  const isbn = r[iIsbn].trim() === '' ? null : r[iIsbn].trim();
  const year = r[iYear].trim() === '' ? null : Math.trunc(Number(r[iYear]));
  insBook.run(Number(r[iBookId]), r[iTitle], isbn, year);
  for (const name of r[iAuthors].split(',').map(s => s.trim()).filter(Boolean)) {
    insAuthor.run(name);
    insBA.run(Number(r[iBookId]), getAuthor.get(name).author_id);
  }
}

// ---- Copies: one per book, plus a second copy for the first five books ----
const insCopy = db.prepare(
  'INSERT INTO copies (book_id, condition) VALUES (?,?)');
const conditions = ['new', 'good', 'good', 'fair', 'worn'];
const bookIds = db.prepare('SELECT book_id FROM books ORDER BY book_id')
  .all().map(r => r.book_id);
bookIds.forEach((id, n) => insCopy.run(id, conditions[n % conditions.length]));
bookIds.slice(0, 5).forEach(id => insCopy.run(id, 'good'));

// One copy is lost (Rule 8): the second copy of book 2 (copy_id 27).
db.exec("UPDATE copies SET status = 'lost' WHERE copy_id = 27");

// ---- Six fictional members (one suspended, one who never borrows) --------
const insMember = db.prepare(
  'INSERT INTO members (name, email, status) VALUES (?,?,?)');
[
  ['Alice Johnson', 'alice.johnson@example.com', 'active'],
  ['Marcus Lee', 'marcus.lee@example.com', 'active'],
  ['Priya Patel', 'priya.patel@example.com', 'active'],
  ['Daniel Okafor', 'daniel.okafor@example.com', 'active'],
  ['Sofia Ramirez', 'sofia.ramirez@example.com', 'suspended'],
  ['Ethan Brooks', 'ethan.brooks@example.com', 'active'], // never borrows
].forEach(m => insMember.run(...m));

// ---- Twelve borrowing records -------------------------------------------
// Due dates are always checkout + 14 days (enforced by the schema CHECK).
const insLoan = db.prepare(
  `INSERT INTO checkouts (copy_id, member_id, checkout_date, due_date, return_date)
   VALUES (?,?,?, date(?, '+14 days'), ?)`);
const loans = [
  // Nine returned loans (Sofia's two predate her suspension).
  [1,  1, '2026-08-01', '2026-08-10'],
  [5,  1, '2026-08-15', '2026-08-28'],
  [2,  2, '2026-08-20', '2026-09-01'],
  [7,  2, '2026-09-05', '2026-09-15'],
  [10, 3, '2026-09-01', '2026-09-12'],
  [12, 4, '2026-09-10', '2026-09-20'],
  [15, 5, '2026-07-01', '2026-07-10'],
  [18, 5, '2026-07-20', '2026-08-02'],
  [26, 3, '2026-09-18', '2026-09-30'],
  // Two loans currently checked out (not yet due).
  [3,  1, '2026-10-20', null],
  [8,  2, '2026-10-24', null],
  // One overdue loan: due 2026-10-09, never returned.
  [20, 4, '2026-09-25', null],
];
loans.forEach(([copy, member, out, ret]) =>
  insLoan.run(copy, member, out, out, ret));
db.exec('COMMIT');

const count = (sql) => db.prepare(sql).get().n;
console.log('books:', count('SELECT COUNT(*) n FROM books'));
console.log('authors:', count('SELECT COUNT(*) n FROM authors'));
console.log('book_authors:', count('SELECT COUNT(*) n FROM book_authors'));
console.log('copies:', count('SELECT COUNT(*) n FROM copies'));
console.log('members:', count('SELECT COUNT(*) n FROM members'));
console.log('checkouts:', count('SELECT COUNT(*) n FROM checkouts'));
db.close();
console.log('library.db built successfully');
