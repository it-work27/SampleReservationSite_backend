const express = require('express');
const pool = require('../utils/db');
const jwt = require('jsonwebtoken');
const { authenticateToken } = require('../middlewares/authenticateToken');

const router = express.Router();
const SECRET_KEY = process.env.SECRET_KEY;

router.post('/login', async (req, res) => {
  const { username, password } = req.body;

  try {
    const result = await pool.query('SELECT * FROM users_tbl WHERE username = $1 AND password = $2', [username, password]);
    const user = result.rows[0];

    if (result.rows.length === 1) {
      const token = jwt.sign({ id: user.id }, SECRET_KEY, { expiresIn: '1h' });
      //res.cookie('token', token, { httpOnly: true });
      return res.status(200).json({ token });
    } else {
      return res.status(401).json({ message: 'Invalid credentials' });
    }
  } catch (error) {
    console.error('Error during login:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

router.post('/logout', (req, res) => {
  return res.status(200).json({ message: 'Logout successful' });
});

router.get('/verify-token', authenticateToken, (req, res) => {
  return res.sendStatus(200);
});

module.exports = router;
