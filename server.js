const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const games = new Map();

const prompts = [
  {
    title: 'Design the perfect office break room',
    bullets: [
      'Introduce a grayscale coffee machine',
      'Add a slide showing a mysterious plant',
      'Include a humorous name badge',
      'Mention a surprising company mascot'
    ]
  },
  {
    title: 'Pitch a new social media app for pets',
    bullets: [
      'Show an app icon that looks like a bone',
      'Tell a story about viral cat memes',
      'Describe the in-app pet profile',
      'Add an unrealistic privacy slogan'
    ]
  },
  {
    title: 'Sell a summer camp for robots',
    bullets: [
      'Mention a sleep mode bonfire',
      'Highlight the swim-with-wires event',
      'Talk about vintage motherboard crafts',
      'Show off the robotic counselor team'
    ]
  },
  {
    title: 'Launch a new breakfast cereal',
    bullets: [
      'Feature cartoon animals on the box',
      'Claim it tastes like morning sunlight',
      'Include a ridiculous prize inside',
      'Describe a cereal mascot with a voice-over'
    ]
  },
  {
    title: 'Explain why your city should host the next space festival',
    bullets: [
      'Emphasize free telescopes for children',
      'List the celebrity astronaut guests',
      'Invent a zero-gravity souvenir',
      'Promote the intergalactic food trucks'
    ]
  }
];

function createGameCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

function createGame() {
  return {
    code: createGameCode(),
    hostId: null,
    players: [],
    stage: 'lobby',
    round: 0,
    currentPrompt: null,
    submissions: {},
    presentationOrder: [],
    currentPresentationIndex: 0,
    votes: {},
    scores: {},
    createdAt: Date.now()
  };
}

function buildGameView(game) {
  return {
    code: game.code,
    hostId: game.hostId,
    players: game.players.map((player) => ({ id: player.id, name: player.name, score: game.scores[player.id] || 0 })),
    stage: game.stage,
    round: game.round,
    currentPrompt: game.currentPrompt ? { title: game.currentPrompt.title, bullets: game.currentPrompt.bullets } : null,
    submissions: Object.entries(game.submissions).map(([playerId, submission]) => ({ playerId, ...submission })),
    currentPresentationIndex: game.currentPresentationIndex,
    presentationOrder: game.presentationOrder,
    votes: game.votes,
    canStartRound: game.players.length >= 2 && game.stage === 'lobby'
  };
}

function cleanupStaleGames() {
  const now = Date.now();
  for (const [code, game] of games.entries()) {
    if (now - game.createdAt > 1000 * 60 * 60) {
      games.delete(code);
    }
  }
}

setInterval(cleanupStaleGames, 1000 * 60 * 5);

app.use(express.static(path.join(__dirname, 'public')));

io.on('connection', (socket) => {
  socket.on('createGame', () => {
    let game = createGame();
    while (games.has(game.code)) {
      game = createGame();
    }
    game.hostId = socket.id;
    games.set(game.code, game);
    socket.join(game.code);
    socket.emit('gameCreated', buildGameView(game));
  });

  socket.on('joinGame', ({ code, name }) => {
    const game = games.get(code?.toUpperCase());
    if (!game) {
      socket.emit('joinFailed', 'Game code not found.');
      return;
    }
    if (game.stage !== 'lobby') {
      socket.emit('joinFailed', 'Round already in progress.');
      return;
    }
    const player = { id: socket.id, name: name.trim().slice(0, 20) || 'Player' };
    game.players.push(player);
    game.scores[player.id] = 0;
    socket.join(game.code);
    io.to(game.code).emit('gameUpdated', buildGameView(game));
    socket.emit('joinedGame', { code: game.code, playerId: player.id, name: player.name });
  });

  socket.on('startRound', ({ code }) => {
    const game = games.get(code);
    if (!game) return;
    if (socket.id !== game.hostId) return;
    if (game.players.length < 2) {
      socket.emit('notice', 'Need at least 2 players to start.');
      return;
    }
    game.round += 1;
    game.stage = 'writing';
    const prompt = prompts[Math.floor(Math.random() * prompts.length)];
    game.currentPrompt = {
      title: prompt.title,
      bullets: prompt.bullets
    };
    game.submissions = {};
    game.presentationOrder = game.players.map((player) => player.id);
    game.currentPresentationIndex = 0;
    game.votes = {};
    io.to(game.code).emit('roundStarted', buildGameView(game));
  });

  socket.on('submitTalk', ({ code, text }) => {
    const game = games.get(code);
    if (!game || game.stage !== 'writing') return;
    game.submissions[socket.id] = {
      text: text.slice(0, 300),
      name: (game.players.find((player) => player.id === socket.id) || {}).name || 'Guest'
    };
    game.votes[socket.id] = {};
    io.to(game.code).emit('gameUpdated', buildGameView(game));
    const allSubmitted = game.players.every((player) => Boolean(game.submissions[player.id]));
    if (allSubmitted) {
      game.stage = 'presentation';
      io.to(game.code).emit('presentationReady', buildGameView(game));
    }
  });

  socket.on('nextPresentation', ({ code }) => {
    const game = games.get(code);
    if (!game || socket.id !== game.hostId || game.stage !== 'presentation') return;
    if (game.currentPresentationIndex < game.presentationOrder.length - 1) {
      game.currentPresentationIndex += 1;
      io.to(game.code).emit('presentationAdvanced', buildGameView(game));
    } else {
      game.stage = 'voting';
      io.to(game.code).emit('votingOpen', buildGameView(game));
    }
  });

  socket.on('vote', ({ code, targetId }) => {
    const game = games.get(code);
    if (!game || game.stage !== 'voting') return;
    if (!game.votes[targetId]) return;
    if (socket.id === targetId) return;
    const alreadyVoted = Object.values(game.votes).some((voteMap) => voteMap[socket.id]);
    if (alreadyVoted) return;
    game.votes[targetId][socket.id] = true;
    io.to(game.code).emit('gameUpdated', buildGameView(game));
  });

  socket.on('finishVoting', ({ code }) => {
    const game = games.get(code);
    if (!game || socket.id !== game.hostId || game.stage !== 'voting') return;
    const scores = Object.entries(game.votes).map(([playerId, votes]) => ({ playerId, count: Object.keys(votes).length }));
    scores.sort((a, b) => b.count - a.count);
    scores.forEach((result) => {
      game.scores[result.playerId] = (game.scores[result.playerId] || 0) + result.count;
    });
    game.stage = 'roundComplete';
    io.to(game.code).emit('roundFinished', { game: buildGameView(game), scores });
  });

  socket.on('resetToLobby', ({ code }) => {
    const game = games.get(code);
    if (!game || socket.id !== game.hostId) return;
    game.stage = 'lobby';
    game.currentPrompt = null;
    game.submissions = {};
    game.presentationOrder = [];
    game.currentPresentationIndex = 0;
    game.votes = {};
    io.to(game.code).emit('gameUpdated', buildGameView(game));
  });

  socket.on('disconnect', () => {
    for (const [code, game] of games.entries()) {
      const index = game.players.findIndex((player) => player.id === socket.id);
      if (index !== -1) {
        game.players.splice(index, 1);
        delete game.scores[socket.id];
        delete game.submissions[socket.id];
      }
      if (game.hostId === socket.id) {
        if (game.players.length > 0) {
          game.hostId = game.players[0].id;
        } else {
          games.delete(code);
          continue;
        }
      }
      io.to(code).emit('gameUpdated', buildGameView(game));
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Talking Points game server listening on http://localhost:${PORT}`);
});
