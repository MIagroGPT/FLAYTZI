const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : false
});

pool.on('connect', () => {
  console.log('[PostgreSQL] Conexión establecida con el pool de base de datos.');
});

pool.on('error', (err) => {
  console.error('[PostgreSQL] Error inesperado en el pool de base de datos:', err);
});

module.exports = {
  query: (text, params) => pool.query(text, params),
  pool
};
