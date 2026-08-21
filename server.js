const path = require('path');
const express = require('express');
const bcrypt = require('bcryptjs');
const cookieParser = require('cookie-parser');
const cors = require('cors');
const db = require('./db');
const { issueToken, requireAuth } = require('./auth');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 4000;
if (process.env.NODE_ENV !== 'production') app.use(cors({ origin: process.env.CLIENT_ORIGIN || 'http://localhost:5173', credentials: true }));
app.use(express.json({ limit: '100kb' }));
app.use(cookieParser());
app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

const defaultCategories = [
  ['Salary', '#16a34a'], ['Freelance', '#0ea5e9'], ['Food & dining', '#f97316'],
  ['Transport', '#8b5cf6'], ['Shopping', '#ec4899'], ['Bills', '#ef4444'],
  ['Entertainment', '#06b6d4'], ['Health', '#14b8a6'], ['Other', '#64748b']
];
const cookieOptions = { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', maxAge: 7 * 24 * 60 * 60 * 1000 };
const asyncRoute = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

app.post('/api/auth/signup', asyncRoute(async (req, res) => {
  const { name, email, password } = req.body;
  if (!name?.trim() || !email?.trim() || !password || password.length < 8) return res.status(400).json({ error: 'Name, email, and an 8-character password are required.' });
  const normalizedEmail = email.trim().toLowerCase();
  const passwordHash = await bcrypt.hash(password, 12);
  try {
    const result = await db.query('INSERT INTO users (name, email, password_hash) VALUES ($1, $2, $3) RETURNING id, name, email', [name.trim(), normalizedEmail, passwordHash]);
    const user = result.rows[0];
    await Promise.all(defaultCategories.map(([category, color]) => db.query('INSERT INTO categories (user_id, name, color) VALUES ($1, $2, $3)', [user.id, category, color])));
    res.cookie('token', issueToken(user), cookieOptions).status(201).json({ user });
  } catch (error) {
    if (error.code === '23505') return res.status(409).json({ error: 'An account with this email already exists.' });
    throw error;
  }
}));

app.post('/api/auth/login', asyncRoute(async (req, res) => {
  const { email, password } = req.body;
  const result = await db.query('SELECT id, name, email, password_hash FROM users WHERE email = $1', [email?.trim().toLowerCase()]);
  const user = result.rows[0];
  if (!user || !(await bcrypt.compare(password || '', user.password_hash))) return res.status(401).json({ error: 'Incorrect email or password.' });
  const publicUser = { id: user.id, name: user.name, email: user.email };
  res.cookie('token', issueToken(publicUser), cookieOptions).json({ user: publicUser });
}));

app.post('/api/auth/logout', (req, res) => res.clearCookie('token', { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production' }).status(204).end());
app.get('/api/auth/me', requireAuth, asyncRoute(async (req, res) => {
  const { rows } = await db.query('SELECT id, name, email FROM users WHERE id = $1', [req.user.sub]);
  if (!rows[0]) return res.status(401).json({ error: 'Session no longer valid.' });
  res.json({ user: rows[0] });
}));

app.get('/api/categories', requireAuth, asyncRoute(async (req, res) => {
  const { rows } = await db.query('SELECT id, name, color FROM categories WHERE user_id = $1 ORDER BY name', [req.user.sub]);
  res.json(rows);
}));
app.post('/api/categories', requireAuth, asyncRoute(async (req, res) => {
  const { name, color = '#64748b' } = req.body;
  if (!name?.trim() || !/^#[0-9a-fA-F]{6}$/.test(color)) return res.status(400).json({ error: 'A category name and hex color are required.' });
  const { rows } = await db.query('INSERT INTO categories (user_id, name, color) VALUES ($1, $2, $3) RETURNING id, name, color', [req.user.sub, name.trim(), color]);
  res.status(201).json(rows[0]);
}));

const transactionFields = (body) => {
  const { type, amount, category_id: categoryId, transaction_date: date, notes = null } = body;
  if (!['income', 'expense'].includes(type) || !Number.isFinite(Number(amount)) || Number(amount) <= 0 || !date) return null;
  return [type, Number(amount), categoryId || null, date, notes?.trim() || null];
};
const baseTransactionQuery = `SELECT t.id, t.type, t.amount::float AS amount, t.transaction_date, t.notes, c.id AS category_id, c.name AS category_name, c.color AS category_color
  FROM transactions t LEFT JOIN categories c ON c.id = t.category_id`;

app.get('/api/transactions', requireAuth, asyncRoute(async (req, res) => {
  const { rows } = await db.query(`${baseTransactionQuery} WHERE t.user_id = $1 ORDER BY t.transaction_date DESC, t.created_at DESC`, [req.user.sub]);
  res.json(rows);
}));
app.post('/api/transactions', requireAuth, asyncRoute(async (req, res) => {
  const fields = transactionFields(req.body);
  if (!fields) return res.status(400).json({ error: 'Type, positive amount, and date are required.' });
  const [type, amount, categoryId, date, notes] = fields;
  if (categoryId) {
    const category = await db.query('SELECT id FROM categories WHERE id = $1 AND user_id = $2', [categoryId, req.user.sub]);
    if (!category.rows[0]) return res.status(400).json({ error: 'Invalid category.' });
  }
  const { rows } = await db.query(`INSERT INTO transactions (user_id, type, amount, category_id, transaction_date, notes) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`, [req.user.sub, type, amount, categoryId, date, notes]);
  const transaction = await db.query(`${baseTransactionQuery} WHERE t.id = $1`, [rows[0].id]);
  res.status(201).json(transaction.rows[0]);
}));
app.put('/api/transactions/:id', requireAuth, asyncRoute(async (req, res) => {
  const fields = transactionFields(req.body);
  if (!fields) return res.status(400).json({ error: 'Type, positive amount, and date are required.' });
  const [type, amount, categoryId, date, notes] = fields;
  if (categoryId) {
    const category = await db.query('SELECT id FROM categories WHERE id = $1 AND user_id = $2', [categoryId, req.user.sub]);
    if (!category.rows[0]) return res.status(400).json({ error: 'Invalid category.' });
  }
  const update = await db.query('UPDATE transactions SET type = $1, amount = $2, category_id = $3, transaction_date = $4, notes = $5, updated_at = NOW() WHERE id = $6 AND user_id = $7 RETURNING id', [type, amount, categoryId, date, notes, req.params.id, req.user.sub]);
  if (!update.rows[0]) return res.status(404).json({ error: 'Transaction not found.' });
  const transaction = await db.query(`${baseTransactionQuery} WHERE t.id = $1`, [req.params.id]);
  res.json(transaction.rows[0]);
}));
app.delete('/api/transactions/:id', requireAuth, asyncRoute(async (req, res) => {
  const result = await db.query('DELETE FROM transactions WHERE id = $1 AND user_id = $2', [req.params.id, req.user.sub]);
  if (!result.rowCount) return res.status(404).json({ error: 'Transaction not found.' });
  res.status(204).end();
}));

app.get('/api/dashboard', requireAuth, asyncRoute(async (req, res) => {
  const userId = req.user.sub;
  const [totals, monthly, categories] = await Promise.all([
    db.query(`SELECT COALESCE(SUM(amount) FILTER (WHERE type = 'income'), 0)::float AS income, COALESCE(SUM(amount) FILTER (WHERE type = 'expense'), 0)::float AS expenses FROM transactions WHERE user_id = $1`, [userId]),
    db.query(`SELECT TO_CHAR(transaction_date, 'Mon') AS month, DATE_TRUNC('month', transaction_date) AS sort_date, SUM(amount)::float AS amount FROM transactions WHERE user_id = $1 AND type = 'expense' AND transaction_date >= DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '5 months' GROUP BY 1, 2 ORDER BY 2`, [userId]),
    db.query(`SELECT COALESCE(c.name, 'Uncategorized') AS name, COALESCE(c.color, '#64748b') AS color, SUM(t.amount)::float AS amount FROM transactions t LEFT JOIN categories c ON c.id = t.category_id WHERE t.user_id = $1 AND t.type = 'expense' GROUP BY 1, 2 ORDER BY amount DESC`, [userId])
  ]);
  const data = totals.rows[0];
  res.json({ totals: { income: data.income, expenses: data.expenses, balance: data.income - data.expenses }, monthly: monthly.rows, categories: categories.rows });
}));

if (process.env.NODE_ENV === 'production') app.use(express.static(path.join(__dirname, '..', 'dist')));
app.use((err, req, res, next) => { console.error(err); res.status(500).json({ error: 'Something went wrong. Please try again.' }); });
app.listen(port, () => console.log(`API running on http://localhost:${port}`));
