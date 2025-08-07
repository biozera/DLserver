const express = require('express');
const cors = require('cors');
const app = express();
const PORT = 10000;

// Permite requisições de qualquer origem (caso queira restringir, use a URL do site específico)
app.use(cors({ origin: '*' }));  // Aceita qualquer origem
app.use(express.json());

let ataques = [];  // Aqui serão armazenados os dados dos ataques recebidos

// Endpoint para coletar ataques de todos os jogadores
app.get('/api/ataques', (req, res) => {
    res.json({ ataques });
});

// Endpoint para coletar ataques de um jogador específico
app.get('/api/ataques/:jogador', (req, res) => {
    const { jogador } = req.params;
    const ataquesJogador = ataques.filter(atk => atk.defender === jogador);  // Filtra ataques para um jogador específico
    res.json(ataquesJogador);
});

// Endpoint para adicionar ataques
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
