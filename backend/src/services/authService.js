const bcrypt = require('bcryptjs');
const pool = require('../config/db');
const { generateToken } = require('../utils/jwt');

class AuthService {
  async register({ name, phone, password }) {
    if (!name || !phone) {
      const err = new Error('Name and phone number are required');
      err.statusCode = 400;
      throw err;
    }

    // Public registration always defaults to FARMER to prevent role escalation
    const role = 'FARMER';

    // Check duplicate phone
    const existing = await pool.query('SELECT id FROM users WHERE phone = $1', [phone]);
    if (existing.rows.length > 0) {
      const err = new Error('Phone number is already registered');
      err.statusCode = 400;
      throw err;
    }

    let passwordHash = null;
    if (password) {
      passwordHash = process.env.USE_MOCK_DB === 'true' ? `mock_hash_${password}` : await bcrypt.hash(password, 10);
    }

    const result = await pool.query(
      `INSERT INTO users (name, phone, role, password_hash)
       VALUES ($1, $2, $3, $4)
       RETURNING id, name, phone, role, created_at`,
      [name, phone, role, passwordHash]
    );

    const user = result.rows[0];
    const token = generateToken(user);

    return { user, token };
  }

  async login({ phone, password }) {
    if (!phone) {
      const err = new Error('Phone number is required');
      err.statusCode = 400;
      throw err;
    }

    if (!password || typeof password !== 'string' || password.trim() === '') {
      const err = new Error('Password is required');
      err.statusCode = 400;
      throw err;
    }

    const result = await pool.query(
      'SELECT id, name, phone, role, password_hash FROM users WHERE phone = $1',
      [phone]
    );

    if (result.rows.length === 0) {
      const err = new Error('Invalid phone number or password');
      err.statusCode = 401;
      throw err;
    }

    const user = result.rows[0];

    if (!user.password_hash) {
      const err = new Error('Invalid phone number or password');
      err.statusCode = 401;
      throw err;
    }

    let isValidPassword = false;
    if (user.password_hash.startsWith('mock_hash_')) {
      isValidPassword = user.password_hash === `mock_hash_${password}`;
    } else {
      try {
        isValidPassword = await bcrypt.compare(password, user.password_hash);
      } catch (e) {
        isValidPassword = false;
      }
    }

    if (!isValidPassword) {
      const err = new Error('Invalid phone number or password');
      err.statusCode = 401;
      throw err;
    }

    delete user.password_hash;
    const token = generateToken(user);

    return { user, token };
  }
}

module.exports = new AuthService();
