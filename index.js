
const express = require('express');
const cors = require('cors');
const app = express();
const PORT = process.env.PORT || 10000;
const cors = require('cors');
app.use(cors()); // Habilita CORS para todas as origens
app.use(cors());
app.use(express.json());

// Banco de dados em memória (pode ser substituído por um banco real)
let ataques = {};  // Estrutura: { jogador: [ataque1, ataque2, ...] }

// API para coletar ataques de um jogador
app.post('/api/ataques', (req, res) => {
  const { jogador, ataques: novosAtaques } = req.body;

  // Se o jogador já tiver ataques, vamos adicionar os novos
  ataques[jogador] = ataques[jogador] || [];
  novosAtaques.forEach(ataque => {
    ataques[jogador].push(ataque);
  });

  res.json({ success: true });
});

// API para consultar todos os ataques de todos os jogadores
app.get('/api/ataques', (req, res) => {
  res.json(ataques);
});

// Filtra os ataques por jogador, tipo de ataque, unidade, etc.
app.get('/api/ataques/filtros', (req, res) => {
  const { jogador, tipo_ataque, unidade } = req.query;

  let resultado = Object.values(ataques).flat();

  if (jogador) {
    resultado = resultado.filter(ataque => ataque.jogador === jogador);
  }
  if (tipo_ataque) {
    resultado = resultado.filter(ataque => ataque.tipo_ataque === tipo_ataque);
  }
  if (unidade) {
    resultado = resultado.filter(ataque => ataque.unidade === unidade);
  }

  res.json(resultado);
});

// Inicializa o servidor
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
