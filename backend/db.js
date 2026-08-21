const { Pool } = require('pg');
require('dotenv').config();

if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required. Copy .env.example to .env.');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : false
});

module.exports = { query: (text, params) => pool.query(text, params), pool };
