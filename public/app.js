const socket = io();
const app = document.getElementById('app');
let currentGame = null;
let playerId = null;
let playerName = null;

function render(template) {
  app.innerHTML = template;
}

function showHome() {
  render(`
    <div class="card fade-in">
      <h2>Play Talking Points</h2>
      <p>Create a lobby as host or join a friend's game.</p>
      <div class="grid grid-two">
        <div class="card">
          <h3>Host a Game</h3>
          <p>Start a game and share the code with your friends.</p>
          <button id="createGameBtn">Create Game</button>
        </div>
        <div class="card">
          <h3>Join a Game</h3>
          <label for="joinName">Name</label>
          <input id="joinName" placeholder="Your name" />
          <label for="joinCode">Game code</label>
          <input id="joinCode" placeholder="ABCD" maxlength="4" />
          <button id="joinGameBtn">Join Game</button>
        </div>
      </div>
    </div>
  `);

  document.getElementById('createGameBtn').addEventListener('click', () => {
    socket.emit('createGame');
  });

  document.getElementById('joinGameBtn').addEventListener('click', () => {
    const name = document.getElementById('joinName').value.trim() || 'Player';
    const code = document.getElementById('joinCode').value.trim().toUpperCase();
    if (!code) return alert('Enter a game code.');
    socket.emit('joinGame', { code, name });
  });
}

function renderLobby(game) {
  const isHost = socket.id === game.hostId;
  const playerRows = game.players
    .map((player) => `<li>${player.name} <strong>${player.score} pts</strong>${player.id === playerId ? ' (you)' : ''}${player.id === game.hostId ? ' — Host' : ''}</li>`)
    .join('');

  render(`
    <div class="card fade-in">
      <div class="status">Lobby ${game.code} — Round ${game.round}</div>
      <h2>Waiting for players</h2>
      <p>Share this game code with friends.</p>
      <p><strong>Code:</strong> ${game.code}</p>
      <div class="card">
        <h3>Players</h3>
        <ul class="list">${playerRows}</ul>
      </div>
      ${isHost ? `<button id="startRoundBtn" ${game.canStartRound ? '' : 'disabled'}>Start Round</button>` : '<p>Waiting for host to start the round.</p>'}
      <button id="backBtn" class="secondary">Leave</button>
    </div>
  `);

  document.getElementById('backBtn').addEventListener('click', () => {
    location.reload();
  });
  if (isHost) {
    document.getElementById('startRoundBtn').addEventListener('click', () => {
      socket.emit('startRound', { code: game.code });
    });
  }
}

function renderWriting(game) {
  const submission = game.submissions[playerId];
  const submitted = Boolean(submission);
  const prompt = game.currentPrompt;
  render(`
    <div class="card fade-in">
      <div class="status">Round ${game.round}</div>
      <h2>Write your talk</h2>
      <p>Use the slide bullet points below to prepare your spoken pitch.</p>
      <div class="card">
        <h3>${prompt.title}</h3>
        <ul class="list">${prompt.bullets.map((bullet) => `<li>${bullet}</li>`).join('')}</ul>
      </div>
      <label for="talkText">Your talk text</label>
      <textarea id="talkText" placeholder="Write your short presentation here..." ${submitted ? 'disabled' : ''}>${submission?.text || ''}</textarea>
      <button id="submitTalkBtn" ${submitted ? 'disabled' : ''}>${submitted ? 'Waiting for others...' : 'Submit Talk'}</button>
      <button id="leaveBtn" class="secondary">Leave Game</button>
    </div>
  `);

  document.getElementById('submitTalkBtn').addEventListener('click', () => {
    const text = document.getElementById('talkText').value.trim();
    if (!text) return alert('Write something first.');
    socket.emit('submitTalk', { code: game.code, text });
  });
  document.getElementById('leaveBtn').addEventListener('click', () => {
    location.reload();
  });
}

function renderPresentation(game) {
  const presenterId = game.presentationOrder[game.currentPresentationIndex];
  const submission = game.submissions[presenterId];
  const presenterName = submission?.name || 'Player';
  const willBeNext = game.currentPresentationIndex < game.presentationOrder.length - 1;

  render(`
    <div class="card fade-in">
      <div class="status">Presentation ${game.currentPresentationIndex + 1} of ${game.presentationOrder.length}</div>
      <h2>${presenterName}'s slide</h2>
      <div class="card">
        <p>${submission?.text || 'No talk submitted.'}</p>
      </div>
      <p>Everyone sees the slide. Host can advance once ready.</p>
      ${socket.id === game.hostId ? `<button id="nextPresentationBtn">${willBeNext ? 'Next Presentation' : 'Open Voting'}</button>` : ''}
    </div>
  `);

  if (socket.id === game.hostId) {
    document.getElementById('nextPresentationBtn').addEventListener('click', () => {
      socket.emit('nextPresentation', { code: game.code });
    });
  }
}

function renderVoting(game) {
  const currentPresenterId = game.presentationOrder[game.currentPresentationIndex];
  const currentSubmission = game.submissions[currentPresenterId];
  const votesCast = Object.values(game.votes).reduce((sum, vote) => sum + Object.keys(vote).length, 0);
  const alreadyVoted = Object.values(game.votes).some((vote) => vote[playerId]);

  const voteOptions = game.presentationOrder
    .filter((id) => id !== playerId)
    .map((id) => {
      const target = game.players.find((player) => player.id === id);
      const score = Object.keys(game.votes[id] || {}).length;
      return `<button class="vote-btn" data-id="${id}">${target?.name || 'Player'} (${score} votes)</button>`;
    })
    .join('');

  render(`
    <div class="card fade-in">
      <div class="status">Voting Round</div>
      <h2>Choose your favorite presentation</h2>
      <p>Vote once for the slide you liked most.</p>
      <div class="card">
        <p><strong>Current slide:</strong> ${currentSubmission?.name}</p>
        <p>${currentSubmission?.text || 'No talk submitted.'}</p>
      </div>
      <div class="grid">${voteOptions}</div>
      <p>${alreadyVoted ? 'You have voted. Waiting for the host to finish voting.' : 'Tap a player to cast your vote.'}</p>
      ${socket.id === game.hostId ? '<button id="finishVotingBtn">Finish Voting</button>' : ''}
    </div>
  `);

  document.querySelectorAll('.vote-btn').forEach((button) => {
    button.addEventListener('click', () => {
      if (alreadyVoted) return alert('You already voted.');
      const targetId = button.dataset.id;
      socket.emit('vote', { code: game.code, targetId });
    });
  });
  if (socket.id === game.hostId) {
    document.getElementById('finishVotingBtn').addEventListener('click', () => {
      socket.emit('finishVoting', { code: game.code });
    });
  }
}

function renderRoundComplete(game, scoreResults = []) {
  const scoreboard = game.players
    .map((player) => `<li>${player.name}: ${player.score} pts</li>`)
    .join('');
  const results = scoreResults.length
    ? `<div class="card"><h3>Vote Results</h3><ul class="list">${scoreResults.map((result) => `<li>${game.players.find((player) => player.id === result.playerId)?.name || 'Player'} — ${result.count} votes</li>`).join('')}</ul></div>`
    : '';

  render(`
    <div class="card fade-in">
      <div class="status">Round ${game.round} Complete</div>
      <h2>Round Results</h2>
      ${results}
      <div class="card">
        <h3>Scoreboard</h3>
        <ul class="list">${scoreboard}</ul>
      </div>
      ${socket.id === game.hostId ? '<button id="resetBtn">Start Next Round</button>' : ''}
    </div>
  `);

  if (socket.id === game.hostId) {
    document.getElementById('resetBtn').addEventListener('click', () => {
      socket.emit('resetToLobby', { code: game.code });
    });
  }
}

socket.on('gameCreated', (game) => {
  currentGame = game;
  playerId = socket.id;
  playerName = 'Host';
  console.debug('[TP] gameCreated payload:', game);
  renderLobby({ ...game, hostId: socket.id });
});

socket.on('joinedGame', ({ code, playerId: id, name }) => {
  playerId = id;
  playerName = name;
});

socket.on('gameUpdated', (game) => {
  currentGame = game;
  console.debug('[TP] gameUpdated payload:', game);
  if (game.stage === 'lobby') {
    renderLobby(game);
  } else if (game.stage === 'writing') {
    renderWriting(game);
  } else if (game.stage === 'presentation') {
    renderPresentation(game);
  } else if (game.stage === 'voting') {
    renderVoting(game);
  } else if (game.stage === 'roundComplete') {
    renderRoundComplete(game);
  }
});

socket.on('roundStarted', (game) => {
  currentGame = game;
  renderWriting(game);
});

socket.on('presentationReady', (game) => {
  currentGame = game;
  renderPresentation(game);
});

socket.on('presentationAdvanced', (game) => {
  currentGame = game;
  renderPresentation(game);
});

socket.on('votingOpen', (game) => {
  currentGame = game;
  renderVoting(game);
});

socket.on('roundFinished', ({ game, scores }) => {
  currentGame = game;
  renderRoundComplete(game, scores);
});

socket.on('joinFailed', (message) => {
  alert(message);
});

socket.on('notice', (message) => {
  alert(message);
});

showHome();
