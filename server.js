// =============================================================
//  Talking Points  —  the game server (the "brain" of the game)
// =============================================================
//
//  Hi! 👋  This file is the SERVER. Think of it as the referee
//  of the game. It doesn't draw anything on the screen. Instead
//  it keeps track of what's happening (who joined, whose turn it
//  is, what the scores are) and tells every phone and TV screen
//  what to show.
//
//  The players' phones and the big TV screen talk to this server
//  using "sockets" (a live, always-on connection). When someone
//  taps a button, their phone sends a little message here, we
//  update the game, and then we send the new game state back to
//  everyone.
//
//  The tools we use:
//    - express   -> serves our web pages (the HTML/CSS/JS files)
//    - socket.io -> the live two-way messaging between phones + server
//    - qrcode    -> turns the join link into a scannable QR code image
//
// -------------------------------------------------------------

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const os = require('os');
const QRCode = require('qrcode');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Every game "room" lives in here, looked up by its 4-letter code.
// A Map is like a labelled box of games: games.get('ABCD') -> that game.
const games = new Map();

// =============================================================
//  1) THE SLIDE CONTENT  (change these to make your own jokes!)
// =============================================================
//
//  A slide is just a little object with an emoji and some text.
//  There are 4 kinds ("types") of slide:
//    - title   : the big topic the speaker has to talk about
//    - picture : a silly "image" (we use a big emoji) to react to
//    - text    : a line the speaker has to read out loud
//    - outro   : the closing slide
//
//  Want to add your own? Just add more objects to these lists!

const TITLE_SLIDES = [
  { emoji: '🍕', text: 'Why Pizza Should Be Its Own Food Group' },
  { emoji: '🧦', text: 'The Secret Life of My Left Sock' },
  { emoji: '🐟', text: 'How to Train Your Goldfish to Do Taxes' },
  { emoji: '📅', text: 'Mondays Are a Government Conspiracy' },
  { emoji: '😴', text: 'The Ultimate Guide to Napping Like a Champion' },
  { emoji: '🎮', text: 'My Bold Plan to Replace Homework With Video Games' },
  { emoji: '🐱', text: 'Cats Are Secretly Running the Internet' },
  { emoji: '🍌', text: 'How Bananas Will Save the Planet' },
  { emoji: '🐉', text: 'Why Every House Needs a Pet Dragon' },
  { emoji: '🤧', text: 'The History of the World\'s Loudest Sneeze' }
];

const PICTURE_SLIDES = [
  { emoji: '🔥', text: 'A dumpster on fire (everything is fine)' },
  { emoji: '🦆', text: 'A very suspicious duck' },
  { emoji: '📉', text: 'A graph going the wrong way' },
  { emoji: '🥔', text: 'A potato wearing a tiny hat' },
  { emoji: '🚀', text: 'A rocket made entirely of spaghetti' },
  { emoji: '🐌', text: 'The fastest snail in the world' },
  { emoji: '👽', text: 'An alien asking for directions' },
  { emoji: '🧀', text: 'A mysterious block of cheese' },
  { emoji: '🤖', text: 'A robot learning to dance' },
  { emoji: '🌮', text: 'A taco that has seen some things' },
  { emoji: '🦕', text: 'A dinosaur at a birthday party' },
  { emoji: '🐙', text: 'An octopus doing eight jobs at once' }
];

const TEXT_SLIDES = [
  { emoji: '💬', text: 'And that brings me to my most important point...' },
  { emoji: '💬', text: 'Studies show that 110% of people agree with me.' },
  { emoji: '💬', text: 'But wait — it gets so much weirder.' },
  { emoji: '💬', text: 'My grandma always said this, and she was usually right.' },
  { emoji: '💬', text: 'Let me hit you with a shocking statistic.' },
  { emoji: '💬', text: 'This next part changed my life forever.' },
  { emoji: '💬', text: 'You might be thinking: "that\'s illegal." You\'d be correct.' },
  { emoji: '💬', text: 'In conclusion, and I cannot stress this enough...' },
  { emoji: '💬', text: 'Experts hate this one simple trick.' }
];

const OUTRO_SLIDES = [
  { emoji: '🎤', text: 'Mic drop. Thank you, goodnight!' },
  { emoji: '🙇', text: 'Takes a deep, dramatic bow.' },
  { emoji: '✨', text: 'And THAT is how I will change the world.' },
  { emoji: '👏', text: 'Feel free to applaud now.' }
];

// The "script" is the order of slide TYPES in one presentation.
// The assistant picks an actual slide for each spot in this list.
// Want longer or shorter talks? Add or remove items here.
const SCRIPT = ['title', 'picture', 'text', 'picture', 'text', 'outro'];

// The speaker gets the full average score. The assistant is their
// helper, so they get HALF the score (just like the real game).
// Change 0.5 to give the assistant more or fewer points.
const ASSISTANT_SCORE_SHARE = 0.5;

// =============================================================
//  2) LITTLE HELPER FUNCTIONS
// =============================================================

// Pick one random item from a list.
function randomItem(list) {
  return list[Math.floor(Math.random() * list.length)];
}

// Give the assistant TWO different choices to pick between.
function pickTwoChoices(type) {
  const pool =
    type === 'title' ? TITLE_SLIDES :
    type === 'picture' ? PICTURE_SLIDES :
    type === 'text' ? TEXT_SLIDES :
    OUTRO_SLIDES;

  const first = randomItem(pool);
  let second = randomItem(pool);
  // Keep rolling until the two options are different (so it's a real choice).
  let safety = 0;
  while (second === first && safety < 20) {
    second = randomItem(pool);
    safety++;
  }
  // We attach the "type" so the screen knows how to show it.
  return [
    { type, emoji: first.emoji, text: first.text },
    { type, emoji: second.emoji, text: second.text }
  ];
}

// Make a random 4-letter room code like "ABCD".
// We skip letters/numbers that are easy to mix up (like O and 0).
function createRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 4; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

// Find this computer's address on the local Wi-Fi (like 192.168.1.20).
// Phones on the SAME Wi-Fi can reach the host at this address. We use it
// so the QR code never accidentally says "localhost" (which only means
// "this device" and wouldn't work from someone else's phone).
function getLanIp() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const net of interfaces[name]) {
      // We want a normal IPv4 address that isn't the internal loopback one.
      if (net.family === 'IPv4' && !net.internal) {
        return net.address;
      }
    }
  }
  return null; // no Wi-Fi/network found
}

// If a web address points at "localhost", swap in the real Wi-Fi address so
// phones can actually reach it. If it's a real website address, leave it alone.
function fixLocalhost(origin) {
  try {
    const url = new URL(origin);
    const isLocal = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
    const lanIp = getLanIp();
    if (isLocal && lanIp) {
      url.hostname = lanIp;
      return url.origin;
    }
  } catch (err) {
    // If the origin wasn't a valid address, just use it as-is.
  }
  return origin;
}

// Round a vote to the nearest 0.1 and keep it between 0 and 10.
// This makes sure a phone can only send a "legal" score.
function cleanScore(value) {
  let n = Number(value);
  if (Number.isNaN(n)) n = 0;
  if (n < 0) n = 0;
  if (n > 10) n = 10;
  // Math.round(n * 10) / 10 turns 5.27 into 5.3, 9.99 into 10.0, etc.
  return Math.round(n * 10) / 10;
}

// =============================================================
//  3) MAKING AND ROTATING A GAME
// =============================================================

function createGame(hostSocketId) {
  return {
    code: createRoomCode(),
    hostSocketId,        // the big TV / laptop screen
    players: [],         // people on their phones: { id, name, score }
    stage: 'lobby',      // lobby -> presenting -> voting -> results
    round: 0,

    // Whose turn it is this round:
    speakerId: null,
    assistantId: null,
    rotation: 0,         // counter we use to rotate roles fairly

    // The presentation in progress:
    script: [],          // the list of slide types for this talk
    slotIndex: 0,        // which slide number we're on (0 = first)
    phase: 'choosing',   // 'choosing' (assistant picking) or 'showing' (slide is up)
    options: [],         // the two choices the assistant is deciding between
    currentSlide: null,  // the slide currently on the big screen

    // The voting:
    votes: {},           // { playerId: score } — filled in during voting
    lastResult: null,    // the average + points from the round just finished

    createdAt: Date.now()
  };
}

// Choose the speaker and assistant for the new round.
// We rotate through the player list so everybody gets a turn.
function assignRoles(game) {
  const n = game.players.length;
  const speaker = game.players[game.rotation % n];
  const assistant = game.players[(game.rotation + 1) % n];
  game.speakerId = speaker.id;
  game.assistantId = assistant.id;
  game.rotation += 1; // next round, the roles shift to the next people
}

// Who is allowed to vote? Everyone EXCEPT the speaker and assistant.
function audiencePlayers(game) {
  return game.players.filter(
    (p) => p.id !== game.speakerId && p.id !== game.assistantId
  );
}

// =============================================================
//  4) THE GAME "VIEW"  (the info we send to every screen)
// =============================================================
//
//  We never send our secret vote numbers to the phones early.
//  We only send what everyone is allowed to see. Each phone then
//  figures out its own role by checking if its id matches the
//  speaker or assistant.

function buildView(game) {
  const audience = audiencePlayers(game);
  const votedIds = Object.keys(game.votes);

  return {
    code: game.code,
    stage: game.stage,
    round: game.round,
    players: game.players.map((p) => ({ id: p.id, name: p.name, score: p.score })),

    speakerId: game.speakerId,
    assistantId: game.assistantId,
    speakerName: nameOf(game, game.speakerId),
    assistantName: nameOf(game, game.assistantId),

    // Presentation info:
    slotIndex: game.slotIndex,
    totalSlides: game.script.length,
    phase: game.phase,
    options: game.options,
    currentSlide: game.currentSlide,

    // Voting info (numbers stay secret until the results screen):
    votedIds,
    votedCount: votedIds.length,
    expectedVoters: audience.length,

    lastResult: game.lastResult,
    canStart: game.players.length >= 3 && game.stage === 'lobby'
  };
}

function nameOf(game, id) {
  const player = game.players.find((p) => p.id === id);
  return player ? player.name : null;
}

// Send the latest game state to everyone in the room (all phones + the TV).
function broadcast(game) {
  io.to(game.code).emit('state', buildView(game));
}

// =============================================================
//  5) CLEAN UP OLD GAMES
// =============================================================
// If a game has been sitting around for over an hour, we throw it
// away so the server doesn't fill up with forgotten games.
setInterval(() => {
  const now = Date.now();
  for (const [code, game] of games.entries()) {
    if (now - game.createdAt > 1000 * 60 * 60) {
      games.delete(code);
    }
  }
}, 1000 * 60 * 5);

// =============================================================
//  6) SERVE THE WEB PAGES
// =============================================================
// Anything inside the "public" folder (HTML, CSS, JS) is sent to
// browsers automatically. "/" shows the TV screen (index.html) and
// "/play" shows the phone controller (play.html).
app.use(express.static(path.join(__dirname, 'public')));

app.get('/play', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'play.html'));
});

// =============================================================
//  7) THE LIVE MESSAGES  (this is where the game actually runs)
// =============================================================
io.on('connection', (socket) => {
  // ---- The TV screen creates a new room ----
  socket.on('host:createRoom', async ({ origin }) => {
    let game = createGame(socket.id);
    // Make sure the code isn't already used by another game.
    while (games.has(game.code)) {
      game = createGame(socket.id);
    }
    games.set(game.code, game);
    socket.join(game.code); // the TV joins its own room to hear updates

    // Build the link players will scan, e.g. https://yoursite.com/play?code=ABCD
    // fixLocalhost makes sure "localhost" becomes the real Wi-Fi address so
    // phones can reach it during an in-person game.
    const joinUrl = `${fixLocalhost(origin)}/play?code=${game.code}`;

    // Turn that link into a QR code image (a data URL we can put in an <img>).
    let qrDataUrl = '';
    try {
      qrDataUrl = await QRCode.toDataURL(joinUrl, { margin: 1, width: 320 });
    } catch (err) {
      console.error('Could not make QR code:', err);
    }

    socket.emit('room:created', { code: game.code, joinUrl, qrDataUrl });
    broadcast(game);
  });

  // ---- A phone joins a room ----
  socket.on('player:join', ({ code, name }) => {
    const game = games.get((code || '').toUpperCase());
    if (!game) {
      socket.emit('joinError', 'That room code was not found.');
      return;
    }
    if (game.stage !== 'lobby') {
      socket.emit('joinError', 'That game has already started.');
      return;
    }
    // Clean up the name: trim spaces and keep it short.
    const cleanName = (name || '').trim().slice(0, 16) || 'Player';
    const player = { id: socket.id, name: cleanName, score: 0 };
    game.players.push(player);
    socket.join(game.code);

    // Tell just this phone "you're in" and its own id + the room code.
    socket.emit('player:joined', { id: player.id, code: game.code, name: player.name });
    broadcast(game);
  });

  // ---- The TV starts a round ----
  socket.on('host:startRound', ({ code }) => {
    const game = games.get(code);
    if (!game || socket.id !== game.hostSocketId) return;
    if (game.players.length < 3) {
      socket.emit('notice', 'You need at least 3 players (speaker, assistant, and an audience).');
      return;
    }
    startRound(game);
  });

  // ---- The assistant picks a slide ----
  socket.on('assistant:pick', ({ code, choice }) => {
    const game = games.get(code);
    if (!game || game.stage !== 'presenting') return;
    if (socket.id !== game.assistantId) return; // only the assistant may pick
    if (game.phase !== 'choosing') return;

    const picked = game.options[choice];
    if (!picked) return;

    game.currentSlide = picked; // this slide goes up on the big screen
    game.phase = 'showing';
    broadcast(game);
  });

  // ---- The assistant moves on to the next slide ----
  socket.on('assistant:next', ({ code }) => {
    const game = games.get(code);
    if (!game || game.stage !== 'presenting') return;
    if (socket.id !== game.assistantId) return;
    if (game.phase !== 'showing') return;

    game.slotIndex += 1;

    if (game.slotIndex < game.script.length) {
      // There are more slides — offer the next two choices.
      game.phase = 'choosing';
      game.options = pickTwoChoices(game.script[game.slotIndex]);
      game.currentSlide = null;
      broadcast(game);
    } else {
      // The talk is over — time to vote!
      startVoting(game);
    }
  });

  // ---- An audience member submits their slider vote ----
  socket.on('audience:vote', ({ code, score }) => {
    const game = games.get(code);
    if (!game || game.stage !== 'voting') return;
    // The speaker and assistant are not allowed to vote.
    if (socket.id === game.speakerId || socket.id === game.assistantId) return;
    // Only real players in this game can vote.
    if (!game.players.some((p) => p.id === socket.id)) return;

    game.votes[socket.id] = cleanScore(score);
    broadcast(game);

    // If everyone in the audience has voted, reveal the scores automatically.
    if (Object.keys(game.votes).length >= audiencePlayers(game).length) {
      revealResults(game);
    }
  });

  // ---- The TV reveals the scores early (in case someone is AFK) ----
  socket.on('host:reveal', ({ code }) => {
    const game = games.get(code);
    if (!game || socket.id !== game.hostSocketId) return;
    if (game.stage !== 'voting') return;
    revealResults(game);
  });

  // ---- The TV starts the next round ----
  socket.on('host:nextRound', ({ code }) => {
    const game = games.get(code);
    if (!game || socket.id !== game.hostSocketId) return;
    if (game.players.length < 3) {
      game.stage = 'lobby';
      broadcast(game);
      return;
    }
    startRound(game);
  });

  // ---- The TV goes back to the lobby ----
  socket.on('host:backToLobby', ({ code }) => {
    const game = games.get(code);
    if (!game || socket.id !== game.hostSocketId) return;
    game.stage = 'lobby';
    broadcast(game);
  });

  // ---- Someone closed their browser / lost connection ----
  socket.on('disconnect', () => {
    for (const [code, game] of games.entries()) {
      // If the TV screen left, close the whole room.
      if (game.hostSocketId === socket.id) {
        io.to(code).emit('roomClosed', 'The host screen disconnected.');
        games.delete(code);
        continue;
      }

      // If a player left, remove them.
      const index = game.players.findIndex((p) => p.id === socket.id);
      if (index !== -1) {
        game.players.splice(index, 1);
        delete game.votes[socket.id];

        // If the speaker or assistant left in the middle of a round,
        // we can't continue — send everyone back to the lobby.
        if (
          game.stage !== 'lobby' &&
          (socket.id === game.speakerId || socket.id === game.assistantId)
        ) {
          game.stage = 'lobby';
          io.to(code).emit('notice', 'The speaker or assistant left, so we went back to the lobby.');
        }

        // If everyone in the audience has now voted, reveal results.
        if (
          game.stage === 'voting' &&
          Object.keys(game.votes).length >= audiencePlayers(game).length &&
          audiencePlayers(game).length > 0
        ) {
          revealResults(game);
        } else {
          broadcast(game);
        }
      }
    }
  });
});

// =============================================================
//  8) THE STAGE FUNCTIONS  (moving the game from one part to the next)
// =============================================================

function startRound(game) {
  game.round += 1;
  assignRoles(game);

  game.stage = 'presenting';
  game.script = SCRIPT.slice();     // a fresh copy of the slide-type order
  game.slotIndex = 0;
  game.phase = 'choosing';
  game.options = pickTwoChoices(game.script[0]); // first two choices
  game.currentSlide = null;
  game.votes = {};
  game.lastResult = null;

  broadcast(game);
}

function startVoting(game) {
  game.stage = 'voting';
  game.votes = {};
  broadcast(game);
}

function revealResults(game) {
  const scores = Object.values(game.votes);

  // The average = all the votes added up, divided by how many there were.
  let average = 0;
  if (scores.length > 0) {
    const total = scores.reduce((sum, s) => sum + s, 0);
    average = Math.round((total / scores.length) * 10) / 10; // keep 1 decimal
  }

  // Give the points out: speaker gets the full average, assistant gets a share.
  const speakerPoints = average;
  const assistantPoints = Math.round(average * ASSISTANT_SCORE_SHARE * 10) / 10;

  const speaker = game.players.find((p) => p.id === game.speakerId);
  const assistant = game.players.find((p) => p.id === game.assistantId);
  if (speaker) speaker.score = Math.round((speaker.score + speakerPoints) * 10) / 10;
  if (assistant) assistant.score = Math.round((assistant.score + assistantPoints) * 10) / 10;

  game.lastResult = {
    average,
    voteCount: scores.length,
    speakerName: nameOf(game, game.speakerId),
    assistantName: nameOf(game, game.assistantId),
    speakerPoints,
    assistantPoints
  };

  game.stage = 'results';
  broadcast(game);
}

// =============================================================
//  9) START THE SERVER
// =============================================================
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  const lanIp = getLanIp();
  console.log('');
  console.log('🎤 Talking Points is running!');
  console.log('');
  console.log(`   On THIS computer:            http://localhost:${PORT}`);
  if (lanIp) {
    // This is the important one for a game night: open the TV screen at THIS
    // address so the QR code works and phones on the same Wi-Fi can join.
    console.log(`   For phones (same Wi-Fi):     http://${lanIp}:${PORT}   <-- open the TV screen here`);
  } else {
    console.log('   (No Wi-Fi network detected — connect to Wi-Fi so phones can join.)');
  }
  console.log('');
});
