import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import Database from 'better-sqlite3';
import { nanoid } from 'nanoid';

const app = express();
app.use(express.json({ limit: '1mb' }));
app.use(cors());
app.use(morgan('dev'));

const db = new Database('attacks.db');
db.exec(`
CREATE TABLE IF NOT EXISTS attacks (
  id TEXT PRIMARY KEY,
  world TEXT NOT NULL,
  attacker TEXT,
  origin TEXT,
  target TEXT,
  type TEXT,
  arrival_at INTEGER NOT NULL,
  source TEXT,
  captured_at INTEGER NOT NULL,
  unique_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique ON attacks(world, unique_hash);
CREATE INDEX IF NOT EXISTS idx_arrival ON attacks(world, arrival_at);
`);

function mkHash(a) {
  // hash simples por campos chave (poderia usar crypto)
  const key = [a.world, a.attacker||'', a.origin||'', a.target||'', a.type||'', a.arrival_at].join('|').toLowerCase();
  // pé-de-cabra: djb2
  let h = 5381;
  for (let i=0;i<key.length;i++) h = ((h<<5)+h) + key.charCodeAt(i);
  return String(h >>> 0);
}

// Middleware de token (opcionalmente permita leitura sem token)
app.use((req,res,next) => {
  req.token = req.get('X-Auth-Token') || '';
  next();
});

// POST /api/attacks  { world, attacks: [...] }
app.post('/api/attacks', (req, res) => {
  const { world, attacks } = req.body || {};
  if (!world || !Array.isArray(attacks)) {
    return res.status(400).json({ error: 'world e attacks são obrigatórios' });
  }

  const now = Date.now();
  const insert = db.prepare(`
    INSERT INTO attacks (id, world, attacker, origin, target, type, arrival_at, source, captured_at, unique_hash, created_at)
    VALUES (@id, @world, @attacker, @origin, @target, @type, @arrival_at, @source, @captured_at, @unique_hash, @created_at)
  `);

  let saved = 0, skipped = 0;
  const tx = db.transaction(() => {
    for (const a of attacks) {
      const rec = {
        id: nanoid(12),
        world,
        attacker: a.attacker || null,
        origin: a.origin || null,
        target: a.target || null,
        type: a.type || null,
        arrival_at: +a.arrival_at || now,
        source: a.source || (req.token ? `user:${req.token.slice(0,6)}` : 'srv'),
        captured_at: +a.captured_at || now,
        unique_hash: mkHash({ ...a, world }),
        created_at: now
      };
      try {
        insert.run(rec);
        saved++;
      } catch (e) {
        if (String(e.message).includes('UNIQUE')) skipped++;
        else throw e;
      }
    }
  });
  try { tx(); } catch (e) {
    return res.status(500).json({ error: e.message });
  }
  res.json({ ok: true, saved, skipped });
});

// GET /api/attacks?world=br123&min_eta_min=15
app.get('/api/attacks', (req, res) => {
  const world = String(req.query.world||'');
  if (!world) return res.status(400).json({ error: 'world obrigatório' });

  const now = Date.now();
  const minEtaMin = parseInt(req.query.min_eta_min||'0', 10);  // chegada em <= X minutos
  const sinceMs = parseInt(req.query.since_ms||'0', 10);       // somente após timestamp
  const limit = Math.min(parseInt(req.query.limit||'5000', 10), 10000);

  let sql = `SELECT attacker, origin, target, type, arrival_at, source, captured_at FROM attacks WHERE world = ?`;
  const args = [world];

  if (minEtaMin > 0) {
    sql += ` AND arrival_at <= ?`;
    args.push(now + minEtaMin*60*1000);
  }
  if (sinceMs > 0) {
    sql += ` AND created_at >= ?`;
    args.push(sinceMs);
  }
  sql += ` ORDER BY arrival_at ASC LIMIT ?`;
  args.push(limit);

  const rows = db.prepare(sql).all(...args);
  res.json({ world, count: rows.length, attacks: rows });
});

// Server health
app.get('/health', (req,res)=>res.json({ ok:true }));

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log('TW Tribe Attacks API ON :', PORT);
});
