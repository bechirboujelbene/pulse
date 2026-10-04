import { db } from './db'
import bcrypt from 'bcryptjs'
import { users, customers, buildFeedback, notes, noteCreatedAt } from './seed-data'

db.exec(`
  DROP TABLE IF EXISTS feedback_notes;
  DROP TABLE IF EXISTS feedback;
  DROP TABLE IF EXISTS customers;
  DROP TABLE IF EXISTS users;

  CREATE TABLE users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL UNIQUE,
    password TEXT NOT NULL,
    name TEXT NOT NULL,
    role TEXT NOT NULL
  );

  CREATE TABLE customers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    plan TEXT NOT NULL,
    health_score INTEGER NOT NULL
  );

  CREATE TABLE feedback (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_id INTEGER NOT NULL,
    channel TEXT NOT NULL,
    message TEXT NOT NULL,
    status TEXT NOT NULL,
    priority TEXT NOT NULL,
    assignee_id INTEGER,
    due_at TEXT,
    created_at TEXT NOT NULL
  );

  CREATE TABLE feedback_notes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    feedback_id INTEGER NOT NULL,
    author_id INTEGER NOT NULL,
    body TEXT NOT NULL,
    is_private INTEGER NOT NULL,
    created_at TEXT NOT NULL
  );
`)

const insertUser = db.prepare('INSERT INTO users (email, password, name, role) VALUES (?, ?, ?, ?)')
for (const u of users) {
  const hashed = bcrypt.hashSync(u.password, 10)
  insertUser.run(u.email, hashed, u.name, u.role)
}

const insertCustomer = db.prepare(
  'INSERT INTO customers (name, email, plan, health_score) VALUES (?, ?, ?, ?)'
)
for (const c of customers) {
  insertCustomer.run(c.name, c.email, c.plan, c.health_score)
}

const insertFeedback = db.prepare(
  'INSERT INTO feedback (customer_id, channel, message, status, priority, assignee_id, due_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
)
const now = Date.now()
const feedback = buildFeedback(now)
for (const f of feedback) {
  insertFeedback.run(f.customer_id, f.channel, f.message, f.status, f.priority, f.assignee_id, f.due_at, f.created_at)
}

const insertNote = db.prepare(
  'INSERT INTO feedback_notes (feedback_id, author_id, body, is_private, created_at) VALUES (?, ?, ?, ?, ?)'
)
notes.forEach((note, i) => {
  insertNote.run(note.feedback_id, note.author_id, note.body, note.is_private, noteCreatedAt(now, i))
})

console.log(
  `Seeded ${users.length} users, ${customers.length} customers, ${feedback.length} feedback items, and ${notes.length} notes.`
)
