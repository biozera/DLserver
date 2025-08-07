// index.js

const express = require('express');
const cors = require('cors');  // Apenas uma vez
const bodyParser = require('body-parser');
const app = express();
const PORT = process.env.PORT || 10000;

// Habilitando o CORS para permitir requisições de diferentes origens
app.use(cors());

// Middleware para parsear o corpo das requisições como JSON
app.use(bodyParser.json());

// Dados de exemplo para simular a API de ataques
let ataques = {};

// Endpoint para receber os ataques
app.post('/api/ataques', (req, res) => {
    const { jogador, ataques: novosAtaques } = req.body;

    // Verificar se já existe dados para o jogador
    if (!ataques[jogador]) {
        ataques[jogador] = [];
    }

    // Adicionar os novos ataques ao jogador específico
    ataques[jogador] = [...ataques[jogador], ...novosAtaques];
    console.log(`Novos ataques recebidos para o jogador ${jogador}:`, novosAtaques);
    res.json({ success: true });
});

// Endpoint para acessar os ataques de um jogador
app.get('/api/ataques/:jogador', (req, res) => {
    const jogador = req.params.jogador;

    if (ataques[jogador]) {
        res.json(ataques[jogador]);
    } else {
        res.json({ message: `Jogador ${jogador} não encontrado.` });
    }
});

// Endpoint para deletar os ataques de um jogador
app.delete('/api/ataques/:jogador', (req, res) => {
    const jogador = req.params.jogador;
    delete ataques[jogador];
    res.json({ success: true, message: `Ataques do jogador ${jogador} deletados.` });
});

// Iniciar o servidor
app.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
});

