// Gestion des utilisateurs en ligne de commande :
//   node server/users.js add <nom> <mot_de_passe> [admin]
//   node server/users.js passwd <nom> <mot_de_passe>
//   node server/users.js remove <nom>
//   node server/users.js list
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
const DATA = process.env.DATA_DIR || path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data');
const f = path.join(DATA, 'users.json');
fs.mkdirSync(DATA, { recursive: true });
let users = []; try { users = JSON.parse(fs.readFileSync(f, 'utf8')); } catch {}
const hash = (p) => { const s = crypto.randomBytes(16).toString('hex'); return s + ':' + crypto.scryptSync(p, s, 32).toString('hex'); };
const [cmd, name, pass, flag] = process.argv.slice(2);
const find = () => users.find((u) => u.name.toLowerCase() === String(name).toLowerCase());
if (cmd === 'add' && name && pass) {
  if (find()) { console.error('Existe déjà'); process.exit(1); }
  users.push({ id: 'u' + crypto.randomBytes(5).toString('hex'), name, pass: hash(pass), admin: flag === 'admin' });
} else if (cmd === 'passwd' && name && pass) {
  const u = find(); if (!u) { console.error('Introuvable'); process.exit(1); } u.pass = hash(pass);
} else if (cmd === 'remove' && name) {
  users = users.filter((u) => u !== find());
} else if (cmd === 'list') {
  for (const u of users) console.log(u.name + (u.admin ? '  (admin)' : ''));
  process.exit(0);
} else { console.error('Usage : voir l’en-tête du fichier'); process.exit(1); }
fs.writeFileSync(f, JSON.stringify(users));
console.log('OK.');
