const express = require('express');
const cors = require('cors');
const app = express();
const PORT = process.env.PORT || 10000;

// Use CORS para permitir requisições de qualquer origem
app.use(cors());

// Se você quiser permitir apenas requisições de um domínio específico
// app.use(cors({ origin: 'https://br135.tribalwars.com.br' }));

app.use(express.json());

let ataques = [];  // Aqui serão armazenados os dados dos ataques recebidos

// Endpoint para coletar ataques de todos os jogadores
app.get('/api/ataques', (req, res) => {
    // Retorna todos os ataques cadastrados, sem filtro
    res.json({ ataques });
});

// Endpoint para coletar ataques de um jogador específico
app.get('/api/ataques/:jogador', (req, res) => {
    const { jogador } = req.params;
    const ataquesJogador = ataques.filter(atk => atk.defender === jogador);  // Filtra ataques para um jogador específico
    res.json(ataquesJogador);
});

// Endpoint para adicionar ataques (simulando que um jogador enviou seus dados)
app.post('/api/ataques', (req, res) => {
    const { jogador, ataques: novosAtaques } = req.body;
    ataques = ataques.filter(atk => atk.defender !== jogador);  // Remove ataques antigos do jogador
    ataques.push(...novosAtaques);  // Adiciona novos ataques

    console.log(`🎯 [DEBUG] Dados de ataques recebidos e processados para ${jogador}`);
    res.json({ success: true, message: "Ataques adicionados com sucesso!" });
});

// Inicia o servidor
app.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
});
