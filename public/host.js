// =============================================================
//  host.js  —  the TV / big-screen brain (front-end)
// =============================================================
//
//  This runs in the browser on the BIG screen (a laptop or TV).
//  Its jobs are:
//    1. Ask the server to create a room.
//    2. Show the QR code + room code so phones can join.
//    3. Show the slides while people present.
//    4. Show the voting progress and the results.
//
//  It talks to the server using "socket" messages.
// -------------------------------------------------------------

const socket = io();
const screen = document.getElementById('screen');

// We remember the room info the server gives us here.
let roomCode = null;
let qrDataUrl = '';
let joinUrl = '';

// Draw some HTML into the screen box.
function show(html) {
  screen.innerHTML = html;
}

// SAFETY: player names come from other people's phones. Before we
// put any name on screen, we run it through this so nobody can
// sneak in sketchy code. It turns < > & into harmless text.
function safe(text) {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// =============================================================
//  The very first screen: a big "Create Room" button
// =============================================================
function showStart() {
  show(`
    <div class="card center fade-in">
      <h2>Ready to host?</h2>
      <p class="muted">Put this screen where everyone can see it. Players will scan a QR code with their phones to join.</p>
      <button id="createBtn">Create a Room</button>
    </div>
  `);
  document.getElementById('createBtn').addEventListener('click', () => {
    // window.location.origin is the web address of THIS page, e.g.
    // "http://localhost:3000" or your live website. We send it so the
    // server can build the correct join link for the QR code.
    socket.emit('host:createRoom', { origin: window.location.origin });
  });
}

// =============================================================
//  The server tells us our room is ready
// =============================================================
socket.on('room:created', (info) => {
  roomCode = info.code;
  qrDataUrl = info.qrDataUrl;
  joinUrl = info.joinUrl;
});

// =============================================================
//  Every time the game changes, the server sends the full "state".
//  We look at state.stage to decide what to draw.
// =============================================================
socket.on('state', (state) => {
  if (state.stage === 'lobby') renderLobby(state);
  else if (state.stage === 'presenting') renderPresenting(state);
  else if (state.stage === 'voting') renderVoting(state);
  else if (state.stage === 'results') renderResults(state);
});

// ---- LOBBY: show the QR code + who has joined ----
function renderLobby(state) {
  const players = state.players
    .map((p) => `<li>${safe(p.name)}<span class="muted">${p.score} pts</span></li>`)
    .join('') || '<li class="muted">No players yet…</li>';

  show(`
    <div class="card center fade-in">
      <div class="status">Lobby</div>
      <h2>Scan to join!</h2>
      ${qrDataUrl ? `<img class="qr" src="${qrDataUrl}" alt="QR code to join" />` : ''}
      <p class="muted">…or go to <strong>${safe(joinUrl)}</strong></p>
      <div class="big-code">${safe(state.code)}</div>
      <p class="muted">Type this code if you join by hand.</p>
    </div>

    <div class="card fade-in">
      <h3>Players (${state.players.length})</h3>
      <ul class="list">${players}</ul>
      <p class="muted">You need at least 3 players (a speaker, an assistant, and someone to vote).</p>
      <button id="startBtn" ${state.canStart ? '' : 'disabled'}>Start Game</button>
    </div>
  `);

  document.getElementById('startBtn').addEventListener('click', () => {
    socket.emit('host:startRound', { code: roomCode });
  });
}

// ---- PRESENTING: show the current slide (or a "choosing" screen) ----
function renderPresenting(state) {
  const counter = `Slide ${state.slotIndex + 1} of ${state.totalSlides}`;

  if (state.phase === 'choosing') {
    // The assistant is picking the next slide on their phone.
    show(`
      <div class="card center fade-in">
        <div class="status">Round ${state.round} · ${counter}</div>
        <h2>🎤 ${safe(state.speakerName)} is presenting</h2>
        <p class="muted">🤔 ${safe(state.assistantName)} (the assistant) is choosing the next slide…</p>
        <div class="slide">
          <div class="emoji">🎬</div>
          <div class="slide-text">Get ready, ${safe(state.speakerName)}!</div>
        </div>
      </div>
    `);
    return;
  }

  // A slide is up on screen — the speaker talks about it.
  const s = state.currentSlide || { emoji: '❓', text: '', type: '' };
  show(`
    <div class="card fade-in">
      <div class="status">Round ${state.round} · ${counter}</div>
      <div class="slide">
        <div class="kind">${safe(s.type)}</div>
        <div class="emoji">${safe(s.emoji)}</div>
        <div class="slide-text">${safe(s.text)}</div>
      </div>
      <p class="center muted" style="margin-top:16px;">
        🎤 <strong>${safe(state.speakerName)}</strong> is talking ·
        🎬 ${safe(state.assistantName)} controls the slides
      </p>
    </div>
  `);
}

// ---- VOTING: show how many people have voted so far ----
function renderVoting(state) {
  show(`
    <div class="card center fade-in">
      <div class="status">Round ${state.round}</div>
      <h2>How was ${safe(state.speakerName)}'s talk?</h2>
      <p class="muted">Audience: grab the slider on your phone and vote from 0 to 10!</p>
      <div class="result-average" style="color:var(--accent-2);">
        ${state.votedCount} / ${state.expectedVoters}
      </div>
      <p class="muted">votes are in</p>
      <button id="revealBtn">Reveal Scores Now</button>
    </div>
  `);
  document.getElementById('revealBtn').addEventListener('click', () => {
    socket.emit('host:reveal', { code: roomCode });
  });
}

// ---- RESULTS: show the average and the scoreboard ----
function renderResults(state) {
  const r = state.lastResult || {};

  // Sort players from highest score to lowest for the scoreboard.
  const board = [...state.players]
    .sort((a, b) => b.score - a.score)
    .map((p, i) => `<li>${i + 1}. ${safe(p.name)}<span class="muted">${p.score} pts</span></li>`)
    .join('');

  show(`
    <div class="card center fade-in">
      <div class="status">Round ${state.round} Results</div>
      <h2>${safe(r.speakerName)}'s score</h2>
      <div class="result-average">${r.average ?? 0}<span class="vote-outof"> / 10</span></div>
      <p class="muted">${r.voteCount || 0} audience vote(s) counted</p>
      <p>
        🎤 ${safe(r.speakerName)} earned <strong>+${r.speakerPoints ?? 0}</strong> ·
        🎬 ${safe(r.assistantName)} earned <strong>+${r.assistantPoints ?? 0}</strong>
      </p>
    </div>

    <div class="card fade-in">
      <h3>🏆 Scoreboard</h3>
      <ul class="list">${board}</ul>
      <button id="nextBtn">Next Round ▶</button>
      <button id="lobbyBtn" class="secondary">Back to Lobby</button>
    </div>
  `);

  document.getElementById('nextBtn').addEventListener('click', () => {
    socket.emit('host:nextRound', { code: roomCode });
  });
  document.getElementById('lobbyBtn').addEventListener('click', () => {
    socket.emit('host:backToLobby', { code: roomCode });
  });
}

// ---- Little pop-up messages from the server ----
socket.on('notice', (message) => alert(message));
socket.on('roomClosed', (message) => {
  alert(message || 'The room was closed.');
  location.reload();
});

// Start everything by showing the "Create a Room" button.
showStart();
