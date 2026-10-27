![Library ERD](erd.png)

# Module 2 Summary: My Library Database

As the library owner, I needed a database that matches how my library actually runs, following the business rules I wrote in `library-rules.md`.

## The six tables

**books** holds the works themselves title, ISBN, and publication year. **authors** stores each author's full name once, no matter how many books they wrote. **book_authors** is a connecting table whose rows each say "this author wrote this book." **copies** holds the physical objects, each with its own ID, condition, and status (available, checked out, or lost). **members** lists borrowers with name, email, and active or suspended status. **checkouts** is the borrowing history: which copy went to which member, with checkout, due, and return dates a blank return date means the book is still out.

## How they relate

Most relationships are one-to-many: one book can have many copies, one copy appears in many checkouts over time, and one member can have many checkouts. Books and authors are many-to-many, which is why book_authors exists in the middle: J.K. Rowling links to six books in my collection through six rows there, and a co-written book links to each of its authors the same way.

## My design decisions

I track physical copies separately from books because owning two copies of one title means one can be checked out while the other sits on the shelf. This also lets me keep lost copies on record without letting anyone borrow them, and makes history honest a checkout is of a specific copy. For authors, the source data packed every name into one comma-separated field; we split those apart during import but kept each name whole rather than forcing unreliable first/last splits (names like "F. Scott Fitzgerald" don't divide cleanly).

## What we changed after reviewing the data

The CSV's ISBN-13 column held unreliable values — stored in numeric scientific notation (like `9.78043902348e+12`), which obscured the final digits so we dropped it and kept only the ISBN-10, stored as text to preserve leading zeros and left optional since about 700 books had none. The original CSV was never modified.

## What the database enforces

It rejects a fourth simultaneous loan, borrowing by suspended members, double-checkout of one copy, loans of lost copies, and due dates that aren't exactly 14 days out, and it updates copy status automatically. Overdue books are found by query, and marking a copy lost or a member suspended remains my manual decision.
