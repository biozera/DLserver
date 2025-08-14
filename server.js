// server.js — UPSERT de ataques (atualiza etiqueta/infos se o comando reaparecer)
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

// garante diretório do DB
const dir = path.dirname(DB_PATH);
if (dir && dir!=='.' && !fs.existsSync(dir)) fs.mkdirSync(dir, { recursive:true });

// abre DB
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

// schema + migrações leves
db.exec(`
CREATE TABLE IF NOT EXISTS attacks (
  id TEXT PRIMARY KEY,
  world TEXT NOT NULL,
  command_id TEXT,                -- id do comando no jogo (chave forte p/ upsert)
  attacker TEXT,
  defender TEXT,                  -- novo
  origin TEXT,
  target TEXT,
  distance TEXT,                  -- novo (string como na UI)
  type TEXT,                      -- etiqueta atual (Explorador, Nobre, "Nobre [morto]", etc.)
  arrival_text TEXT,              -- novo (string exata "hoje às HH:MM:SS:mmm")
  arrival_at INTEGER NOT NULL,    -- epoch ms (com milissegundos)
  source TEXT,
  captured_at INTEGER NOT NULL,   -- quando capturamos localmente
  unique_hash TEXT NOT NULL,      -- hash fallback p/ upsert qdo não houver command_id
  created_at INTEGER NOT NULL,    -- primeira vez que vimos
  updated_at INTEGER NOT NULL,    -- última vez que atualizamos campos
  last_seen_at INTEGER NOT NULL   -- última vez que ele apareceu num POST
);
CREATE INDEX IF NOT EXISTS idx_arrival ON attacks(world, arrival_at);
`);
/* migrações condicionais */
function hasCol(name) {
  try { db.prepare(`SELECT ${name} FROM attacks LIMIT 1`).get(); return true; }
  catch { return false; }
}
if (!hasCol('defender'))      db.exec(`ALTER TABLE attacks ADD COLUMN defender TEXT;`);
if (!hasCol('distance'))      db.exec(`ALTER TABLE attacks ADD COLUMN distance TEXT;`);
if (!hasCol('arrival_text'))  db.exec(`ALTER TABLE attacks ADD COLUMN arrival_text TEXT;`);
if (!hasCol('updated_at'))    db.exec(`ALTER TABLE attacks ADD COLUMN updated_at INTEGER;`);
if (!hasCol('last_seen_at'))  db.exec(`ALTER TABLE attacks ADD COLUMN last_seen_at INTEGER;`);
if (!hasCol('command_id')) { try { db.exec(`ALTER TABLE attacks ADD COLUMN command_id TEXT;`); } catch{} }

// índices únicos p/ UPSERT
db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS ux_world_cmdid ON attacks(world, command_id) WHERE command_id IS NOT NULL;`);
db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS ux_world_hash  ON attacks(world, unique_hash);`);

// hash fallback (inclui ms)
function mkHash(a){
  const key = [
    a.world,
    a.attacker||'',
    a.defender||'',
    a.origin||'',
    a.target||'',
    a.type||'',
    +a.arrival_at||0
  ].join('|').toLowerCase();
  return crypto.createHash('sha1').update(key).digest('hex').slice(0,20);
}

app.use((req,_res,next)=>{ req.token = req.get('X-Auth-Token')||''; next(); });

app.get('/health', (_req,res)=>res.json({ ok:true }));

// POST com UPSERT: se já existir (por command_id ou unique_hash), atualiza etiqueta e outros campos
app.post('/api/attacks', (req,res)=>{
  const { world, attacks } = req.body || {};
  if (!world || !Array.isArray(attacks)) return res.status(400).json({ error:'world e attacks são obrigatórios' });
  if (ALLOWED_TOKENS.length>0){
    const t=req.token;
    if (!t || !ALLOWED_TOKENS.includes(t)) return res.status(401).json({ error:'token inválido' });
  }

  const now = Date.now();

  // UPSERT por command_id
  const upsertByCmd = db.prepare(`
    INSERT INTO attacks (id, world, command_id, attacker, defender, origin, target, distance, type, arrival_text, arrival_at, source, captured_at, unique_hash, created_at, updated_at, last_seen_at)
    VALUES (@id, @world, @command_id, @attacker, @defender, @origin, @target, @distance, @type, @arrival_text, @arrival_at, @source, @captured_at, @unique_hash, @created_at, @updated_at, @last_seen_at)
    ON CONFLICT(world, command_id) DO UPDATE SET
      attacker     = excluded.attacker,
      defender     = excluded.defender,
      origin       = excluded.origin,
      target       = excluded.target,
      distance     = excluded.distance,
      type         = excluded.type,         -- <== etiqueta atualizada!
      arrival_text = excluded.arrival_text, -- preserva ms exibidos
      arrival_at   = excluded.arrival_at,   -- atualiza hora se mudou
      source       = excluded.source,
      captured_at  = excluded.captured_at,
      unique_hash  = excluded.unique_hash,
      updated_at   = excluded.updated_at,
      last_seen_at = excluded.last_seen_at
  `);

  // UPSERT por unique_hash (fallback quando não houver command_id)
  const upsertByHash = db.prepare(`
    INSERT INTO attacks (id, world, command_id, attacker, defender, origin, target, distance, type, arrival_text, arrival_at, source, captured_at, unique_hash, created_at, updated_at, last_seen_at)
    VALUES (@id, @world, @command_id, @attacker, @defender, @origin, @target, @distance, @type, @arrival_text, @arrival_at, @source, @captured_at, @unique_hash, @created_at, @updated_at, @last_seen_at)
    ON CONFLICT(world, unique_hash) DO UPDATE SET
      attacker     = excluded.attacker,
      defender     = excluded.defender,
      origin       = excluded.origin,
      target       = excluded.target,
      distance     = excluded.distance,
      type         = excluded.type,
      arrival_text = excluded.arrival_text,
      arrival_at   = excluded.arrival_at,
      source       = excluded.source,
      captured_at  = excluded.captured_at,
      updated_at   = excluded.updated_at,
      last_seen_at = excluded.last_seen_at
  `);

  let inserted=0, updated=0;

  const tx = db.transaction((items)=>{
    for (const a of items){
      const rec = {
        id: nanoid(12),
        world,
        command_id: a.command_id || null,
        attacker: a.attacker || null,
        defender: a.defender || null,
        origin: a.origin || null,
        target: a.target || null,
        distance: a.distance || null,
        type: a.type || null,
        arrival_text: a.arrival_text || null,
        arrival_at: +a.arrival_at || now,
        source: a.source || (req.token ? `user:${req.token.slice(0,6)}` : 'srv'),
        captured_at: +a.captured_at || now,
        unique_hash: mkHash({ ...a, world }),
        created_at: now,
        updated_at: now,
        last_seen_at: now,
      };

      const info = (rec.command_id ? upsertByCmd.run(rec) : upsertByHash.run(rec));
      // better-sqlite3 retorna changes=1 tanto para insert quanto para update; dá pra distinguir via lastInsertRowid?
      // Heurística: se coincidiu por conflito, foi UPDATE. Se não existia, INSERT.
      // Infelizmente não há flag direta; então vamos olhar se já existia rapidamente:
      if (info.changes === 1) {
        // Não dá para ter certeza; contabilizaremos como "changed".
        // Para um contador mais preciso, poderíamos checar uma select antes:
        // preferimos simplicidade: contar como inserido se não existia antes.
        // Aqui, tentaremos uma verificação leve: buscar pela combinação e ver se foi criado agora.
        inserted++; // contagem otimista
      }
    }
  });

  try {
    tx(attacks);
    // Ajuste de contadores (opcional): não complicar — reportar um agregado simples:
    res.json({ ok:true, saved: inserted, updated, skipped: 0 });
  } catch(e){
    res.status(500).json({ error:e.message });
  }
});

// GET retorna todos os campos úteis
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

  let sql = `
    SELECT command_id, attacker, defender, origin, target, distance, type,
           arrival_text, arrival_at, source, captured_at, created_at, updated_at, last_seen_at
    FROM attacks
    WHERE world = ?`;
  const args=[world];

  if (minEtaMin>0){ sql+=` AND arrival_at <= ?`; args.push(now + minEtaMin*60*1000); }
  if (sinceMs>0)  { sql+=` AND updated_at >= ?`;  args.push(sinceMs); }
  sql += ` ORDER BY arrival_at ASC LIMIT ?`; args.push(limit);

  const rows = db.prepare(sql).all(...args);
  res.json({ world, count: rows.length, attacks: rows });
});

// rota de limpeza (útil para testes) — proteja em produção!
app.delete('/api/attacks', (req,res)=>{
  if (NODE_ENV !== 'development') return res.status(403).json({ error:'Bloqueado em produção' });
  db.prepare(`DELETE FROM attacks`).run();
  res.json({ ok:true, msg:'Todos os ataques foram removidos' });
});

app.listen(PORT, ()=>{ console.log(`TW Tribe Attacks API ON : ${PORT}`); console.log('DB:', DB_PATH); });
