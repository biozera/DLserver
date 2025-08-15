import express from 'express';
import Database from 'better-sqlite3';
import cors from 'cors';

const app = express();
const PORT = process.env.PORT || 3000;

// === BANCO DE DADOS ===
const db = new Database('./attacks.db');

// Cria tabela se não existir
db.prepare(`
CREATE TABLE IF NOT EXISTS attacks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    command_id TEXT NOT NULL,
    world TEXT NOT NULL,
    type TEXT,
    target TEXT,
    defender TEXT,
    origin TEXT,
    attacker TEXT,
    distance TEXT,
    arrival_text TEXT,
    arrival_at INTEGER,
    captured_at INTEGER,
    source TEXT,
    UNIQUE(command_id, world)
)
`).run();

// === MIDDLEWARE ===
app.use(cors());
app.use(express.json());

// Função de limpeza automática - CORRIGIDA
function cleanOldAttacks() {
    const now = Date.now();
    // Margem de segurança: remove apenas ataques que passaram há mais de 1 hora
    const SAFETY_MARGIN = 60 * 60 * 1000; // 1 hora em milissegundos
    const cutoffTime = now - SAFETY_MARGIN;
    
    const stmt = db.prepare(`DELETE FROM attacks WHERE arrival_at < ?`);
    const info = stmt.run(cutoffTime);
    
    if (info.changes > 0) {
        console.log(`[CLEANUP] Removidos ${info.changes} ataques antigos (mais de 1h passados)`);
    }
}

// === ENDPOINT: RECEBER ATAQUES ===
app.post('/api/attacks', (req, res) => {
    const token = req.headers['x-auth-token'];
    const { world, attacks } = req.body;

    if (!token || !world || !Array.isArray(attacks)) {
        return res.status(400).json({ ok: false, error: 'Parâmetros inválidos' });
    }

    try {
        const insert = db.prepare(`
            INSERT INTO attacks (command_id, world, type, target, defender, origin, attacker, distance, arrival_text, arrival_at, captured_at, source)
            VALUES (@command_id, @world, @type, @target, @defender, @origin, @attacker, @distance, @arrival_text, @arrival_at, @captured_at, @source)
            ON CONFLICT(command_id, world) DO UPDATE SET
                type=excluded.type,
                target=excluded.target,
                defender=excluded.defender,
                origin=excluded.origin,
                attacker=excluded.attacker,
                distance=excluded.distance,
                arrival_text=excluded.arrival_text,
                arrival_at=excluded.arrival_at,
                captured_at=excluded.captured_at,
                source=excluded.source
        `);

        const insertMany = db.transaction((rows) => {
            rows.forEach(row => {
                insert.run({
                    command_id: row.command_id || '',
                    world: world,
                    type: row.type || '',
                    target: row.target || '',
                    defender: row.defender || '',
                    origin: row.origin || '',
                    attacker: row.attacker || '',
                    distance: row.distance || '',
                    arrival_text: row.arrival_text || '',
                    arrival_at: row.arrival_at || 0,
                    captured_at: row.captured_at || Date.now(),
                    source: row.source || ''
                });
            });
        });

        insertMany(attacks);

        // Limpa ataques vencidos
        cleanOldAttacks();

        res.json({ ok: true, count: attacks.length });
    } catch (err) {
        console.error('Erro ao salvar ataques:', err);
        res.status(500).json({ ok: false, error: err.message });
    }
});

// === ENDPOINT: LISTAR ATAQUES ===
app.get('/api/attacks', (req, res) => {
    const token = req.headers['x-auth-token'];
    const world = req.query.world;

    if (!token || !world) {
        return res.status(400).json({ ok: false, error: 'Token ou mundo inválido' });
    }

    try {
        const now = Date.now();

        // Limpa ataques vencidos antes de buscar
        cleanOldAttacks();

        // Busca ataques futuros (sem margem aqui, pois queremos mostrar todos os válidos)
        const rows = db.prepare(`
            SELECT * FROM attacks
            WHERE world = ?
              AND arrival_at >= ?
            ORDER BY arrival_at ASC
        `).all(world, now);

        res.json({ ok: true, attacks: rows });
    } catch (err) {
        console.error('Erro ao buscar ataques:', err);
        res.status(500).json({ ok: false, error: err.message });
    }
});

// === INICIAR SERVIDOR ===
app.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
});
