const express = require('express');
const cors = require('cors');
const app = express();
const PORT = 10000;

// Permite requisições de qualquer origem
app.use(cors());  
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

    // Remove ataques antigos do jogador antes de adicionar os novos
    ataques = ataques.filter(atk => atk.defender !== jogador);  
    ataques.push(...novosAtaques);  // Adiciona os novos ataques recebidos ao array de ataques

    console.log(`🎯 [DEBUG] Dados de ataques recebidos e processados para ${jogador}`);
    res.json({ success: true, message: "Ataques adicionados com sucesso!" });
});

// Inicia o servidor na porta configurada
app.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
});
