const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const games = new Map();

const promptTemplates = [
  'I’ll be teaching you all about why we need _____.',
  'Today, I’m going to explain how ____ can change the world.',
  'I believe ____ is the reason we should be excited.',
  'The main reason ____ matters is because _____.',
  'You might be surprised to learn that ____ is actually essential.',
  'Here’s why ____ deserves more attention than it gets.',
  'If I had to convince everyone about ____, I’d say this.',
  'My favorite thing about ____ is that it helps us ____.'
];

const imageDeck = [
  { id: 'demon', label: 'Demon Coffee', emoji: '☕', caption: 'A ritual cup of chaos', imageUrl: 'https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?auto=format&fit=crop&w=900&q=80' },
  { id: 'clown', label: 'Clown Parade', emoji: '🤡', caption: 'The circus is in session', imageUrl: 'https://images.unsplash.com/photo-1519345182560-3f2917c472ef?auto=format&fit=crop&w=900&q=80' },
  { id: 'giant', label: 'Giant Foot', emoji: '🥾', caption: 'A dramatic entrance', imageUrl: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&w=900&q=80' },
  { id: 'maze', label: 'Maze', emoji: '🧩', caption: 'The puzzle gets weirder', imageUrl: 'https://images.unsplash.com/photo-1511497584788-876760111969?auto=format&fit=crop&w=900&q=80' },
  { id: 'monster', label: 'Monster Plant', emoji: '🌱', caption: 'Nature went too far', imageUrl: 'https://images.unsplash.com/photo-1466692476868-aef1dfb1e735?auto=format&fit=crop&w=900&q=80' },
  { id: 'storm', label: 'Stormy Sky', emoji: '⛈️', caption: 'The weather is suspicious', imageUrl: 'https://images.unsplash.com/photo-1506744038136-46273834b3fb?auto=format&fit=crop&w=900&q=80' },
  { id: 'haunted', label: 'Haunted Hall', emoji: '🏚️', caption: 'A very bad idea', imageUrl: 'https://images.unsplash.com/photo-1506744038136-46273834b3fb?auto=format&fit=crop&w=900&q=80' },
  { id: 'robot', label: 'Robot', emoji: '🤖', caption: 'Mechanical genius', imageUrl: 'https://images.unsplash.com/photo-1485827404703-89b55fcc595e?auto=format&fit=crop&w=900&q=80' },
  { id: 'fire', label: 'Fireworks', emoji: '🎆', caption: 'A loud conclusion', imageUrl: 'https://images.unsplash.com/photo-1516483638261-f4dbaf036963?auto=format&fit=crop&w=900&q=80' },
  { id: 'umbrella', label: 'Umbrella Chaos', emoji: '☂️', caption: 'Prepared for disaster', imageUrl: 'https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=900&q=80' },
  { id: 'skeleton', label: 'Skeleton', emoji: '💀', caption: 'A dramatic reveal', imageUrl: 'https://images.unsplash.com/photo-1516627145497-ae6968895b74?auto=format&fit=crop&w=900&q=80' },
  { id: 'monster2', label: 'Alien Face', emoji: '👾', caption: 'The plot thickens', imageUrl: 'https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=900&q=80' }
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
    slides: [],
    currentSlideIndex: 0,
    speakerId: null,
    assistantId: null,
    timerEndsAt: null,
    ratings: {},
    lastRoundSummary: null,
    scores: {},
    topicOptions: [],
    pendingImageOptions: [],
    selectedNextImage: null,
    promptTemplates: {},
    promptDrafts: {},
    roleUsage: { speaker: {}, assistant: {} },
    winnerId: null,
    createdAt: Date.now()
  };
}

function getTimeRemaining(game) {
  if (!game.timerEndsAt) return 0;
  return Math.max(0, Math.ceil((game.timerEndsAt - Date.now()) / 1000));
}

function shuffle(items) {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
  }
  return copy;
}

function getRandomImageOptions() {
  return shuffle(imageDeck).slice(0, 4);
}

function assignPromptTemplates(game) {
  const players = game.players.filter((player) => player.id !== game.hostId);
  const shuffled = shuffle(promptTemplates);
  const assignedTemplates = {};

  players.forEach((player, index) => {
    assignedTemplates[player.id] = shuffled[index % shuffled.length];
  });

  game.promptTemplates = assignedTemplates;
}

function pickSpeakerAndAssistant(players, game) {
  const speakerCandidates = players.map((player) => ({ player, count: game.roleUsage.speaker[player.id] || 0 }));
  const minSpeakerCount = Math.min(...speakerCandidates.map((entry) => entry.count));
  const eligibleSpeakers = speakerCandidates.filter((entry) => entry.count === minSpeakerCount);
  const speaker = eligibleSpeakers[Math.floor(Math.random() * eligibleSpeakers.length)].player;

  const assistantCandidates = players
    .filter((player) => player.id !== speaker.id)
    .map((player) => ({ player, count: game.roleUsage.assistant[player.id] || 0 }));
  const minAssistantCount = Math.min(...assistantCandidates.map((entry) => entry.count));
  const eligibleAssistants = assistantCandidates.filter((entry) => entry.count === minAssistantCount);
  const assistant = eligibleAssistants[Math.floor(Math.random() * eligibleAssistants.length)].player;

  return { speaker, assistant };
}

function buildGameView(game) {
  const speaker = game.players.find((player) => player.id === game.speakerId);
  const assistant = game.players.find((player) => player.id === game.assistantId);
  const currentSlide = game.slides[game.currentSlideIndex] || null;

  return {
    code: game.code,
    hostId: game.hostId,
    players: game.players.map((player) => ({ id: player.id, name: player.name, score: game.scores[player.id] || 0 })),
    stage: game.stage,
    round: game.round,
    currentPrompt: game.currentPrompt,
    slides: game.slides,
    currentSlideIndex: game.currentSlideIndex,
    currentSlide,
    speakerId: game.speakerId,
    assistantId: game.assistantId,
    speakerName: speaker?.name || null,
    assistantName: assistant?.name || null,
    timerSeconds: getTimeRemaining(game),
    ratings: game.ratings,
    lastRoundSummary: game.lastRoundSummary,
    topicOptions: game.topicOptions,
    pendingImageOptions: game.pendingImageOptions,
    selectedNextImage: game.selectedNextImage,
    promptTemplates: game.promptTemplates || {},
    promptDrafts: game.promptDrafts || {},
    winnerId: game.winnerId || null,
    canStartRound: game.players.length >= 2 && game.stage === 'lobby',
    allPromptsSubmitted: game.players.filter((player) => player.id !== game.hostId).every((player) => !!game.promptDrafts[player.id])
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
setInterval(() => {
  for (const game of games.values()) {
    if ((game.stage === 'topicChoice' || game.stage === 'countdown' || game.stage === 'playing') && game.timerEndsAt) {
      io.to(game.code).emit('gameUpdated', buildGameView(game));
    }
  }
}, 1000);

setInterval(() => {
  for (const game of games.values()) {
    if (game.stage === 'countdown' && game.timerEndsAt && Date.now() >= game.timerEndsAt) {
      game.stage = 'playing';
      game.timerEndsAt = Date.now() + 120000;
      io.to(game.code).emit('gameUpdated', buildGameView(game));
    }

    if (game.stage === 'playing' && game.timerEndsAt && Date.now() >= game.timerEndsAt) {
      game.stage = 'rating';
      game.timerEndsAt = null;
      io.to(game.code).emit('ratingOpen', buildGameView(game));
    }
  }
}, 1000);

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
    game.stage = 'promptDrafting';
    game.currentPrompt = null;
    game.topicOptions = [];
    game.slides = [];
    game.currentSlideIndex = 0;
    game.speakerId = null;
    game.assistantId = null;
    game.timerEndsAt = null;
    game.ratings = {};
    game.lastRoundSummary = null;
    game.pendingImageOptions = [];
    game.selectedNextImage = null;
    game.promptDrafts = {};
    game.winnerId = null;
    assignPromptTemplates(game);

    io.to(game.code).emit('roundStarted', buildGameView(game));
  });

  socket.on('submitPrompt', ({ code, prompt }) => {
    const game = games.get(code);
    if (!game || game.stage !== 'promptDrafting' || socket.id === game.hostId) return;

    const value = prompt?.trim();
    if (!value) return;

    game.promptDrafts[socket.id] = value;
    io.to(game.code).emit('gameUpdated', buildGameView(game));
  });

  socket.on('beginRound', ({ code }) => {
    const game = games.get(code);
    if (!game || socket.id !== game.hostId || game.stage !== 'promptDrafting') return;

    const allPlayersSubmitted = game.players.filter((player) => player.id !== game.hostId).every((player) => !!game.promptDrafts[player.id]);
    if (!allPlayersSubmitted) {
      socket.emit('notice', 'Every player needs to submit a prompt before the round can begin.');
      return;
    }

    const { speaker, assistant } = pickSpeakerAndAssistant(game.players, game);
    const promptChoices = shuffle(Object.values(game.promptDrafts)).slice(0, 4);

    game.speakerId = speaker.id;
    game.assistantId = assistant.id;
    game.roleUsage.speaker[speaker.id] = (game.roleUsage.speaker[speaker.id] || 0) + 1;
    game.roleUsage.assistant[assistant.id] = (game.roleUsage.assistant[assistant.id] || 0) + 1;
    game.topicOptions = promptChoices;
    game.stage = 'topicChoice';
    game.currentPrompt = null;
    game.slides = [];
    game.currentSlideIndex = 0;
    game.timerEndsAt = null;
    game.ratings = {};
    game.pendingImageOptions = [];
    game.selectedNextImage = null;

    io.to(game.code).emit('roundStarted', buildGameView(game));
  });

  socket.on('chooseTopic', ({ code, topic }) => {
    const game = games.get(code);
    if (!game || game.stage !== 'topicChoice' || socket.id !== game.assistantId) return;

    const speakerName = game.players.find((player) => player.id === game.speakerId)?.name || 'Speaker';
    const assistantName = game.players.find((player) => player.id === game.assistantId)?.name || 'Assistant';
    const textOptions = [
      'This next slide really proves my point.',
      `${speakerName} said this next slide persuaded them to agree with me.`,
      'This next slide makes the argument much easier to believe.',
      `${assistantName} said this next slide changed their mind.`,
      'The evidence on this next slide is impossible to ignore.',
      `${speakerName} swears this next slide seals the deal.`
    ];

    const slides = [{ type: 'prompt', text: topic, subtitle: 'Prompt' }];
    for (let index = 1; index <= 10; index += 1) {
      if (index % 2 === 1) {
        slides.push({ type: 'image', text: '', subtitle: `Slide ${index}` });
      } else {
        slides.push({ type: 'text', text: textOptions[(index / 2) - 1] || 'This next slide really proves my point.', subtitle: `Slide ${index}` });
      }
    }

    game.currentPrompt = topic;
    game.slides = slides;
    game.currentSlideIndex = 0;
    game.stage = 'countdown';
    game.pendingImageOptions = getRandomImageOptions();
    game.selectedNextImage = null;
    game.timerEndsAt = Date.now() + 3000;

    io.to(game.code).emit('gameUpdated', buildGameView(game));
  });

  socket.on('chooseImageForNextSlide', ({ code, imageId }) => {
    const game = games.get(code);
    if (!game || game.stage !== 'playing' || socket.id !== game.assistantId) return;

    const image = game.pendingImageOptions.find((entry) => entry.id === imageId);
    if (!image) return;

    const nextIndex = game.currentSlideIndex + 1;
    if (nextIndex >= game.slides.length || game.slides[nextIndex]?.type !== 'image') return;

    game.slides[nextIndex] = {
      type: 'image',
      text: image.caption,
      subtitle: `Slide ${nextIndex}`,
      imageUrl: image.imageUrl,
      emoji: image.emoji
    };
    game.selectedNextImage = image;
    game.pendingImageOptions = getRandomImageOptions();

    io.to(game.code).emit('gameUpdated', buildGameView(game));
  });

  socket.on('nextSlide', ({ code }) => {
    const game = games.get(code);
    if (!game) return;
    if (game.stage !== 'playing' || socket.id !== game.speakerId) return;

    const nextIndex = game.currentSlideIndex + 1;
    const nextSlide = game.slides[nextIndex];

    if (nextSlide && nextSlide.type === 'image' && !nextSlide.imageUrl) {
      socket.emit('notice', 'The assistant must choose an image for the next slide first.');
      return;
    }

    game.currentSlideIndex = nextIndex;
    game.selectedNextImage = null;

    if (game.currentSlideIndex === game.slides.length - 1) {
      game.stage = 'rating';
      game.timerEndsAt = null;
      io.to(game.code).emit('ratingOpen', buildGameView(game));
      return;
    }

    game.pendingImageOptions = getRandomImageOptions();
    io.to(game.code).emit('gameUpdated', buildGameView(game));
  });

  socket.on('endSpeaking', ({ code }) => {
    const game = games.get(code);
    if (!game) return;
    if (socket.id !== game.hostId) return;
    if (game.stage === 'playing' || game.stage === 'topicChoice') {
      game.stage = 'rating';
      game.timerEndsAt = null;
      io.to(game.code).emit('ratingOpen', buildGameView(game));
    }
  });

  socket.on('rateRound', ({ code, stars }) => {
    const game = games.get(code);
    if (!game || game.stage !== 'rating') return;
    if (socket.id === game.speakerId || socket.id === game.assistantId || socket.id === game.hostId) return;

    const rating = Math.max(0.1, Math.min(10, Number(stars) || 0.1));
    game.ratings[socket.id] = rating;
    io.to(game.code).emit('gameUpdated', buildGameView(game));
  });

  socket.on('finishRatings', ({ code }) => {
    const game = games.get(code);
    if (!game || socket.id !== game.hostId || game.stage !== 'rating') return;

    const reviewers = game.players.filter((player) => player.id !== game.speakerId && player.id !== game.assistantId && player.id !== game.hostId);
    const values = reviewers.map((player) => game.ratings[player.id]).filter((value) => Number.isFinite(value));
    const average = values.length ? Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(1)) : 0;

    game.scores[game.speakerId] = (game.scores[game.speakerId] || 0) + average;
    game.scores[game.assistantId] = (game.scores[game.assistantId] || 0) + average;
    game.lastRoundSummary = {
      speakerId: game.speakerId,
      assistantId: game.assistantId,
      average,
      ratings: { ...game.ratings }
    };

    const allPlayersHaveBothRoles = game.players.every((player) => (game.roleUsage.speaker[player.id] || 0) >= 1 && (game.roleUsage.assistant[player.id] || 0) >= 1);
    if (allPlayersHaveBothRoles) {
      const sorted = [...game.players].sort((a, b) => (game.scores[b.id] || 0) - (game.scores[a.id] || 0));
      game.winnerId = sorted[0]?.id || null;
      game.stage = 'gameOver';
      io.to(game.code).emit('gameOver', buildGameView(game));
      return;
    }

    game.stage = 'promptDrafting';
    game.currentPrompt = null;
    game.currentSlideIndex = 0;
    game.speakerId = null;
    game.assistantId = null;
    game.ratings = {};
    game.pendingImageOptions = [];
    game.selectedNextImage = null;
    game.slides = [];
    game.topicOptions = [];
    game.promptDrafts = {};
    assignPromptTemplates(game);

    io.to(game.code).emit('gameUpdated', buildGameView(game));
  });

  socket.on('resetToLobby', ({ code }) => {
    const game = games.get(code);
    if (!game || socket.id !== game.hostId) return;

    game.stage = 'lobby';
    game.round = 0;
    game.currentPrompt = null;
    game.slides = [];
    game.currentSlideIndex = 0;
    game.speakerId = null;
    game.assistantId = null;
    game.timerEndsAt = null;
    game.ratings = {};
    game.lastRoundSummary = null;
    game.pendingImageOptions = [];
    game.selectedNextImage = null;
    game.promptDrafts = {};
    game.promptTemplates = {};
    game.roleUsage = { speaker: {}, assistant: {} };
    game.winnerId = null;

    io.to(game.code).emit('gameUpdated', buildGameView(game));
  });

  socket.on('disconnect', () => {
    for (const [code, game] of games.entries()) {
      const index = game.players.findIndex((player) => player.id === socket.id);
      if (index !== -1) {
        game.players.splice(index, 1);
        delete game.scores[socket.id];
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
