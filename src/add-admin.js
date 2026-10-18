
require('dotenv').config();

const readline = require('node:readline/promises');
const { stdin, stdout } = require('node:process');
const bcrypt = require('bcryptjs');
const db = require('./db');

async function main() {
  const rl = readline.createInterface({
    input: stdin,
    output: stdout
  });

  try {
    const username = (
      await rl.question('New admin username: ')
    ).trim();

    const fullName = (
      await rl.question('Admin full name: ')
    ).trim();

    const password = await rl.question(
      'New password (minimum 12 characters): '
    );

    if (!username || !fullName) {
      throw new Error('Username and full name are required.');
    }

    if (password.length < 12) {
      throw new Error('Password must be at least 12 characters.');
    }

    const existing = db.prepare(
      'SELECT id, role FROM users WHERE username = ?'
    ).get(username);

    if (existing) {
      throw new Error(
        'This username already exists. Choose a different username.'
      );
    }

    const passwordHash = bcrypt.hashSync(password, 12);

    const result = db.prepare(`
      INSERT INTO users
        (username, password_hash, full_name, role, status)
      VALUES (?, ?, ?, 'admin', 'active')
    `).run(username, passwordHash, fullName);

    console.log('\nNew admin created successfully!');
    console.log('Username:', username);
    console.log('Role: admin');
    console.log('User ID:', result.lastInsertRowid);
    console.log('Now try logging in with your new credentials.');
  } catch (error) {
    console.error('\nAdmin creation failed:', error.message);
    process.exitCode = 1;
  } finally {
    rl.close();
    db.close();
  }
}

main();
