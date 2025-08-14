// server.js — dedupe por command_id e/ou arrival_at com ms
import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import Database from 'better-sqlite3';
import { nanoid } from 'nanoid';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const PORT = process.env.PORT || 8080;
const NODE_ENV = process.env.NODE_ENV || 'production';
const DB_PATH = process.env.DB_PATH || 'attacks.db';

const ALLOWED_TOKENS = (process.env.ALLOWED_TOKENS || '').split(',').map(s=>s.trim()).filter(Boolean);
const ALLOW_READ_NO_TOKEN = (process.env.ALLOW_READ_NO_TOKEN ?? 'true') === 'true';
const CORS_ORIGINS = (process.env.CORS_ORIGINS || '').split(',').map(s=>s.trim()).filter(Boolean);

const app = express();
app.use(express.json({ limit:'1mb' }));
app.use(morgan(NODE_ENV==='development'?'dev':'tiny'));

if (CORS_ORIGINS.length===0) app.use(cors());
else app.use(cors({
  origin: (origin, cb)=>{
    if (!origin) return cb(null, true);
    try {
      const host = new URL(origin).hostname;
      const ok = CORS_ORIGINS.some(p=>host===p || host.endsWith(`.${p}`));
      return cb(ok?null:new Error('CORS bloqueado'), ok);
    } catch { return cb(new Error('CORS inválido')); }
  }
}));

const dir = path.dirname(DB_PATH);
if (dir && dir!=='.' && !fs.existsSync(dir)) fs.mkdirSync(dir, { recursive:true });

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

db.exec(`
CREATE TABLE IF NOT EXISTS attacks (
  id TEXT PRIMARY KEY,
  world TEXT NOT NULL,
  command_id TEXT,
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
CREATE INDEX IF NOT EXISTS idx_arrival ON attacks(world, arrival_at);
`);

// migração leve: garantir coluna command_id e índice único parcial
try { db.prepare(`SELECT command_id FROM attacks LIMIT 1`).get(); }
catch { db.exec(`ALTER TABLE attacks ADD COLUMN command_id TEXT;`); }

db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS ux_world_cmdid ON attacks(world, command_id) WHERE command_id IS NOT NULL;`);

function mkHash(a){
  // inclui ms em arrival_at para dedupe por horário exato quando não há command_id
  const key = [
    a.world,
    a.attacker||'',
    a.origin||'',
    a.target||'',
    a.type||'',
    +a.arrival_at||0 // mantém milissegundos
  ].join('|').toLowerCase();
  return crypto.createHash('sha1').update(key).digest('hex').slice(0,20);
}

app.use((req,_res,next)=>{ req.token = req.get('X-Auth-Token')||''; next(); });

app.get('/health', (_req,res)=>res.json({ ok:true }));

app.post('/api/attacks', (req,res)=>{
  const { world, attacks } = req.body || {};
  if (!world || !Array.isArray(attacks)) return res.status(400).json({ error:'world e attacks são obrigatórios' });
  if (ALLOWED_TOKENS.length>0){
    const t=req.token;
    if (!t || !ALLOWED_TOKENS.includes(t)) return res.status(401).json({ error:'token inválido' });
  }

  const now = Date.now();
  const insert = db.prepare(`
    INSERT INTO attacks (id, world, command_id, attacker, origin, target, type, arrival_at, source, captured_at, unique_hash, created_at)
    VALUES (@id, @world, @command_id, @attacker, @origin, @target, @type, @arrival_at, @source, @captured_at, @unique_hash, @created_at)
  `);

  let saved=0, skipped=0;
  const tx = db.transaction((items)=>{
    for (const a of items){
      const rec = {
        id: nanoid(12),
        world,
        command_id: a.command_id || null,
        attacker: a.attacker || null,
        origin: a.origin || null,
        target: a.target || null,
        type: a.type || null,
        arrival_at: +a.arrival_at || now, // pode conter ms
        source: a.source || (req.token ? `user:${req.token.slice(0,6)}` : 'srv'),
        captured_at: +a.captured_at || now,
        unique_hash: mkHash({ ...a, world }),
        created_at: now
      };
      try {
        insert.run(rec);
        saved++;
      } catch(e){
        // se bater no índice único de command_id OU no unique_hash (se você quiser criar), tratamos como duplicado
        if (String(e.message).includes('UNIQUE') || String(e.message).includes('constraint')) skipped++;
        else throw e;
      }
    }
  });

  try { tx(attacks); res.json({ ok:true, saved, skipped }); }
  catch(e){ res.status(500).json({ error:e.message }); }
});

app.get('/api/attacks', (req,res)=>{
  if (!ALLOW_READ_NO_TOKEN && ALLOWED_TOKENS.length>0){
    const t=req.token; if (!t || !ALLOWED_TOKENS.includes(t)) return res.status(401).json({ error:'token inválido' });
  }
  const world = String(req.query.world||'');
  if (!world) return res.status(400).json({ error:'world obrigatório' });

  const now=Date.now();
  const minEtaMin = parseInt(req.query.min_eta_min||'0',10);
  const sinceMs   = parseInt(req.query.since_ms||'0',10);
  const limit     = Math.min(parseInt(req.query.limit||'5000',10), 10000);

  let sql = `SELECT attacker, origin, target, type, arrival_at, source, captured_at
             FROM attacks WHERE world = ?`;
  const args=[world];

  if (minEtaMin>0){ sql+=` AND arrival_at <= ?`; args.push(now + minEtaMin*60*1000); }
  if (sinceMs>0)  { sql+=` AND created_at >= ?`;  args.push(sinceMs); }
  sql += ` ORDER BY arrival_at ASC LIMIT ?`; args.push(limit);

  const rows = db.prepare(sql).all(...args);
  res.json({ world, count: rows.length, attacks: rows });
});

app.listen(PORT, ()=>{ console.log(`TW Tribe Attacks API ON : ${PORT}`); console.log('DB:', DB_PATH); });
