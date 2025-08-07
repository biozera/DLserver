
// ==UserScript==
// @name         TW Central de Comandos
// @namespace    Violentmonkey Scripts
// @version      1.0
// @description  Coleta ataques e envia para o servidor
// @author       Você
// @match        *://*.tribalwars.com.br/game.php*screen=overview_villages*
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  const API_URL = 'https://tw-central-comandos.onrender.com/api/ataques';
  const JOGADOR = game_data.player.name.trim();

  function coletarAtaques() {
    const linhas = document.querySelectorAll('#incomings_table tr.row_a, #incomings_table tr.row_b');
    const ataques = [];

    linhas.forEach(tr => {
      const tds = tr.querySelectorAll('td');
      if (tds.length < 7) return;

      const destinoNome = tds[1]?.textContent.trim() || '—';
      const origemNome = tds[2]?.textContent.trim() || '—';
      const jogadorNome = tds[3]?.textContent.trim() || '—';
      const distancia = tds[4]?.textContent.trim() || '—';
      const chegada = tds[5]?.textContent.trim() || '—';

      ataques.push({
        destinoNome,
        origemNome,
        jogadorNome,
        distancia,
        chegada,
        tipo_ataque: 'attack_large', // Exemplo de tipo de ataque
        unidade: 'ariete', // Exemplo de unidade
        jogador: JOGADOR,
      });
    });

    fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jogador: JOGADOR, ataques })
    })
    .then(r => r.json())
    .then(res => console.log('✅ Enviado com sucesso:', res))
    .catch(e => console.error('❌ Falha ao enviar', e));
  }

  function criarBotao() {
    const container = document.querySelector('#questlog_new');
    if (!container) return;

    const botao = document.createElement('div');
    botao.className = 'quest';
    botao.style.background = '#333';
    botao.style.color = '#fff';
    botao.style.textAlign = 'center';
    botao.style.fontWeight = 'bold';
    botao.style.cursor = 'pointer';
    botao.textContent = 'B';
    botao.title = 'Abrir Central de Comandos';
    botao.onclick = mostrarCentral;

    container.appendChild(botao);
  }

  function mostrarCentral() {
    fetch(`${API_URL}`)
      .then(r => r.json())
      .then(data => exibirTabela(data));
  }

  function exibirTabela(ataques) {
    // Exibe a tabela no formato desejado
  }

  if (window.location.href.includes('screen=overview_villages') && window.location.href.includes('mode=incomings')) {
    setTimeout(coletarAtaques, 300000); // Atualiza a cada 5 minutos
  }

  criarBotao();
})();
