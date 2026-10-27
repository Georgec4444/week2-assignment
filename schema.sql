-- MSAI-5523 Module 2: Library Database Schema
-- Derived from library-rules.md business rules.

PRAGMA foreign_keys = ON;

-- Rule 1: Books (title, ISBN, publication year). ISBN-10 is optional TEXT
-- to preserve leading zeros; publication_year is a nullable integer and
-- may be negative (BC works).
CREATE TABLE books (
    book_id          INTEGER PRIMARY KEY,
    title            TEXT NOT NULL,
    isbn             TEXT UNIQUE,
    publication_year INTEGER
);

-- Rule 1: A book may have multiple authors. Full names, not split.
CREATE TABLE authors (
    author_id INTEGER PRIMARY KEY,
    name      TEXT NOT NULL UNIQUE
);

-- Junction table resolving the many-to-many between books and authors.
CREATE TABLE book_authors (
    book_id   INTEGER NOT NULL REFERENCES books(book_id),
    author_id INTEGER NOT NULL REFERENCES authors(author_id),
    PRIMARY KEY (book_id, author_id)
);

-- Rule 2: Physical copies with unique ID, condition, and status.
-- Rule 8: Lost copies stay in this table, flagged by status.
CREATE TABLE copies (
    copy_id   INTEGER PRIMARY KEY,
    book_id   INTEGER NOT NULL REFERENCES books(book_id),
    condition TEXT NOT NULL,
    status    TEXT NOT NULL DEFAULT 'available'
              CHECK (status IN ('available', 'checked_out', 'lost'))
);

-- Rule 3: Members with ID, name, email, and active/suspended status.
CREATE TABLE members (
    member_id INTEGER PRIMARY KEY,
    name      TEXT NOT NULL,
    email     TEXT NOT NULL UNIQUE,
    status    TEXT NOT NULL DEFAULT 'active'
              CHECK (status IN ('active', 'suspended'))
);

-- Rule 10: Borrowing history with checkout, due, and return dates.
-- Rule 5: The CHECK constraint forces due_date = checkout_date + 14 days.
-- Rule 7: A loan is overdue when return_date IS NULL and due_date < today.
CREATE TABLE checkouts (
    checkout_id   INTEGER PRIMARY KEY,
    copy_id       INTEGER NOT NULL REFERENCES copies(copy_id),
    member_id     INTEGER NOT NULL REFERENCES members(member_id),
    checkout_date TEXT NOT NULL,
    due_date      TEXT NOT NULL
                  CHECK (due_date = date(checkout_date, '+14 days')),
    return_date   TEXT
);

-- Rule 6: The same copy cannot be on two open loans at once.
CREATE UNIQUE INDEX idx_one_open_loan_per_copy
    ON checkouts(copy_id) WHERE return_date IS NULL;

-- Rules 4, 6, 8, 9: Validations when a new OPEN loan is created.
-- (Historical, already-returned records can be back-filled without these
-- checks, since they describe the past, not a new borrowing event.)
CREATE TRIGGER trg_checkout_validate
BEFORE INSERT ON checkouts
WHEN NEW.return_date IS NULL
BEGIN
    -- Rule 9: suspended members cannot borrow.
    SELECT RAISE(ABORT, 'Member is suspended and cannot borrow')
    WHERE (SELECT status FROM members WHERE member_id = NEW.member_id)
          = 'suspended';

    -- Rules 6 and 8: copy must be available (not checked out, not lost).
    SELECT RAISE(ABORT, 'Copy is not available for checkout')
    WHERE (SELECT status FROM copies WHERE copy_id = NEW.copy_id)
          <> 'available';

    -- Rule 4: at most three open loans per member.
    SELECT RAISE(ABORT, 'Member already has three books checked out')
    WHERE (SELECT COUNT(*) FROM checkouts
           WHERE member_id = NEW.member_id AND return_date IS NULL) >= 3;
END;

-- Keep copy status in sync: a new open loan marks the copy checked out.
CREATE TRIGGER trg_checkout_open
AFTER INSERT ON checkouts
WHEN NEW.return_date IS NULL
BEGIN
    UPDATE copies SET status = 'checked_out' WHERE copy_id = NEW.copy_id;
END;

-- Keep copy status in sync: returning a loan makes the copy available.
CREATE TRIGGER trg_checkout_return
AFTER UPDATE OF return_date ON checkouts
WHEN OLD.return_date IS NULL AND NEW.return_date IS NOT NULL
BEGIN
    UPDATE copies SET status = 'available' WHERE copy_id = NEW.copy_id;
END;
