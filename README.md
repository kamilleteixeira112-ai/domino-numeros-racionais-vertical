# 🎲 Dominó dos Números Racionais — versão com mesa vertical

Versão experimental/aperfeiçoada do jogo educativo de dominó para estudantes praticarem equivalência entre **frações** e **números decimais**.

## Novidades desta versão

- Mesa em **serpentina**, com peças horizontais e verticais nas curvas, aproximando a visualização de um dominó físico.
- A orientação visual é separada da lógica matemática: a regra continua sendo reconhecer equivalências entre números racionais.
- Ao clicar em **Sair** durante uma partida ativa, o jogador recebe confirmação de desistência; confirmando, o adversário é declarado vencedor.
- Perda de conexão **não** conta automaticamente como desistência.
- Feedback de fim de partida:
  - vencedor: troféu + confetes em CSS/JS;
  - perdedor: mensagem encorajadora;
  - empate: mensagem neutra e convite para nova rodada.
- Resumo simples de desempenho: quantidade de peças encaixadas corretamente.

## Arquitetura

- GitHub Pages para hospedagem estática.
- Firebase Authentication anônimo para identificar cada navegador sem cadastro do aluno.
- Firebase Realtime Database para salas de 2 jogadores e sincronização.
- O mesmo projeto Firebase da versão estável é reutilizado.

## Estrutura

```text
.
├── index.html
├── css/styles.css
├── js/
│   ├── app.js
│   ├── board-layout.js      # layout visual serpenteado da mesa
│   ├── domino-data.js
│   ├── game-logic.js
│   ├── firebase-service.js
│   ├── firebase-config.js
│   └── demo-service.js
├── firebase.rules.json
└── .github/workflows/pages.yml
```

## Observação sobre a mesa vertical

A ordem matemática das peças continua linear. `board-layout.js` apenas converte cada posição da corrente em coordenadas visuais. Isso evita misturar regra pedagógica com estética e facilita manutenção futura.

## GitHub Pages

Em **Settings > Pages**, selecione **GitHub Actions** como fonte de publicação. O workflow já está pronto.
