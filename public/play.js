// =============================================================
//  play.js  —  the PHONE controller brain (front-end)
// =============================================================
//
//  This runs on each player's phone. What it shows depends on
//  your role for the current round:
//    - Speaker  : "look at the TV and talk!"
//    - Assistant: buttons to pick the next slide
//    - Audience : a slider to vote from 0.0 to 10.0
// -------------------------------------------------------------

const socket = io();
const screen = document.getElementById('screen');

// We remember who we are once we've joined.
let myId = null;      // our own player id (given by the server)
let roomCode = null;  // the room we joined
let joined = false;   // have we joined a game yet?

function show(html) {
  screen.innerHTML = html;
}

// Same safety helper as on the TV screen — never trust raw text.
function safe(text) {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// If the QR code included the room code (?code=ABCD), grab it so we
// can fill it in automatically. This means players only type a name.
function codeFromLink() {
  const params = new URLSearchParams(window.location.search);
  return (params.get('code') || '').toUpperCase();
}

// =============================================================
//  The JOIN screen (name + code)
// =============================================================
function showJoin(errorMessage) {
  const prefill = codeFromLink();
  show(`
    <div class="card fade-in">
      <h2>Join a game</h2>
      ${errorMessage ? `<p style="color:var(--accent);">${safe(errorMessage)}</p>` : ''}
      <label for="joinName">Your name</label>
      <input type="text" id="joinName" placeholder="e.g. Alex" maxlength="16" />
      <label for="joinCode">Room code</label>
      <input type="text" id="joinCode" placeholder="ABCD" maxlength="4" value="${safe(prefill)}" />
      <button id="joinBtn">Join</button>
    </div>
  `);

  document.getElementById('joinBtn').addEventListener('click', () => {
    const name = document.getElementById('joinName').value.trim();
    const code = document.getElementById('joinCode').value.trim().toUpperCase();
    if (!name) return alert('Please type your name.');
    if (!code) return alert('Please type the room code.');
    socket.emit('player:join', { code, name });
  });
}

// =============================================================
//  Messages from the server
// =============================================================

// We joined successfully — remember our id and code.
socket.on('player:joined', (info) => {
  myId = info.id;
  roomCode = info.code;
  joined = true;
});

// Joining failed (wrong code, game already started, etc.).
socket.on('joinError', (message) => {
  showJoin(message);
});

// The full game state — redraw our controls based on it.
socket.on('state', (state) => {
  if (!joined) return; // ignore until we've actually joined
  render(state);
});

socket.on('notice', (message) => alert(message));
socket.on('roomClosed', (message) => {
  alert(message || 'The room closed.');
  location.reload();
});

// =============================================================
//  Decide what this phone should show
// =============================================================
function myRole(state) {
  if (myId === state.speakerId) return 'speaker';
  if (myId === state.assistantId) return 'assistant';
  return 'audience';
}

function render(state) {
  if (state.stage === 'lobby') return renderLobby(state);
  if (state.stage === 'presenting') return renderPresenting(state);
  if (state.stage === 'voting') return renderVoting(state);
  if (state.stage === 'results') return renderResults(state);
}

// ---- LOBBY: just wait for the host to start ----
function renderLobby(state) {
  const me = state.players.find((p) => p.id === myId);
  show(`
    <div class="card center fade-in">
      <div class="status">Room ${safe(state.code)}</div>
      <h2>You're in! 🎉</h2>
      <p>Playing as <strong>${safe(me ? me.name : 'Player')}</strong></p>
      <p class="muted">${state.players.length} player(s) joined. Waiting for the host to start…</p>
    </div>
  `);
}

// ---- PRESENTING: totally different per role ----
function renderPresenting(state) {
  const role = myRole(state);

  if (role === 'speaker') {
    show(`
      <div class="card center fade-in">
        <span class="role speaker">SPEAKER 🎤</span>
        <h2>You're up!</h2>
        <p>Look at the big screen and talk about whatever slide appears. You can't see them coming — just improvise and have fun!</p>
        <p class="muted">Slide ${state.slotIndex + 1} of ${state.totalSlides}</p>
      </div>
    `);
    return;
  }

  if (role === 'assistant') {
    if (state.phase === 'choosing') {
      // Show the two choice cards as tappable buttons.
      const buttons = state.options
        .map(
          (opt, i) => `
          <button class="choice" data-choice="${i}" style="height:auto;">
            <div class="emoji">${safe(opt.emoji)}</div>
            <div class="txt">${safe(opt.text)}</div>
          </button>`
        )
        .join('');
      show(`
        <div class="card fade-in">
          <span class="role assistant">ASSISTANT 🎬</span>
          <h2>Pick the next slide</h2>
          <p class="muted">Choose one to send to the speaker. Be sneaky! (Slide ${state.slotIndex + 1} of ${state.totalSlides})</p>
          <div class="choices">${buttons}</div>
        </div>
      `);
      // When a choice is tapped, tell the server which one.
      document.querySelectorAll('[data-choice]').forEach((btn) => {
        btn.addEventListener('click', () => {
          socket.emit('assistant:pick', {
            code: roomCode,
            choice: Number(btn.dataset.choice)
          });
        });
      });
    } else {
      // A slide is showing — offer a "Next" button.
      const s = state.currentSlide || { emoji: '❓', text: '' };
      const lastSlide = state.slotIndex + 1 >= state.totalSlides;
      show(`
        <div class="card center fade-in">
          <span class="role assistant">ASSISTANT 🎬</span>
          <h2>Slide is up!</h2>
          <div class="slide" style="padding:18px;">
            <div class="emoji" style="font-size:3rem;">${safe(s.emoji)}</div>
            <div class="slide-text" style="font-size:1.1rem;">${safe(s.text)}</div>
          </div>
          <p class="muted">Let the speaker talk, then move on.</p>
          <button id="nextBtn">${lastSlide ? 'Finish → Start Voting' : 'Next Slide ▶'}</button>
        </div>
      `);
      document.getElementById('nextBtn').addEventListener('click', () => {
        socket.emit('assistant:next', { code: roomCode });
      });
    }
    return;
  }

  // Audience during the presentation: just watch.
  show(`
    <div class="card center fade-in">
      <span class="role audience">AUDIENCE 👀</span>
      <h2>Enjoy the show!</h2>
      <p>Watch <strong>${safe(state.speakerName)}</strong> on the big screen. Get your scores ready — you'll vote right after.</p>
    </div>
  `);
}

// ---- VOTING: the slider (audience only) ----
function renderVoting(state) {
  const role = myRole(state);

  // Speaker and assistant don't vote — they wait.
  if (role !== 'audience') {
    show(`
      <div class="card center fade-in">
        <span class="role ${role}">${role === 'speaker' ? 'SPEAKER 🎤' : 'ASSISTANT 🎬'}</span>
        <h2>You're being judged 😅</h2>
        <p class="muted">The audience is voting on your talk. Hang tight!</p>
      </div>
    `);
    return;
  }

  // Have I already voted this round?
  const alreadyVoted = state.votedIds.includes(myId);
  if (alreadyVoted) {
    show(`
      <div class="card center fade-in">
        <span class="role audience">AUDIENCE 👀</span>
        <h2>Thanks for voting! ✅</h2>
        <p class="muted">Waiting for the other voters… (${state.votedCount} / ${state.expectedVoters})</p>
      </div>
    `);
    return;
  }

  // The slider! min 0, max 10, step 0.1 -> lets people pick 3.5, 9.9, etc.
  show(`
    <div class="card center fade-in">
      <span class="role audience">AUDIENCE 👀</span>
      <h2>Rate ${safe(state.speakerName)}'s talk</h2>
      <div class="vote-number"><span id="voteValue">5.0</span><span class="vote-outof"> / 10</span></div>
      <input type="range" id="slider" min="0" max="10" step="0.1" value="5" />
      <div class="range-ends"><span>0 · terrible</span><span>amazing · 10</span></div>
      <button id="voteBtn">Submit Vote</button>
    </div>
  `);

  const slider = document.getElementById('slider');
  const valueLabel = document.getElementById('voteValue');

  // Every time the slider moves, update the big number.
  // toFixed(1) shows one decimal place, so "5" becomes "5.0".
  slider.addEventListener('input', () => {
    valueLabel.textContent = Number(slider.value).toFixed(1);
  });

  document.getElementById('voteBtn').addEventListener('click', () => {
    socket.emit('audience:vote', {
      code: roomCode,
      score: Number(slider.value)
    });
  });
}

// ---- RESULTS: everyone sees the average + scoreboard ----
function renderResults(state) {
  const r = state.lastResult || {};
  const me = state.players.find((p) => p.id === myId);

  show(`
    <div class="card center fade-in">
      <div class="status">Round ${state.round} done</div>
      <h2>${safe(r.speakerName)} scored ${r.average ?? 0} / 10</h2>
      <p class="muted">You have <strong>${me ? me.score : 0}</strong> points total.</p>
      <p class="muted">Watch the big screen for the scoreboard. The host will start the next round.</p>
    </div>
  `);
}

// =============================================================
//  Start on the join screen
// =============================================================
showJoin();
