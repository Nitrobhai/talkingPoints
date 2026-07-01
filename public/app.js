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

function renderPromptDrafting(game) {
  const isHost = socket.id === game.hostId;
  const promptTemplate = game.promptTemplates?.[socket.id] || 'Finish the sentence below.';
  const myDraft = game.promptDrafts?.[socket.id] || '';
  const players = game.players.filter((player) => player.id !== game.hostId);
  const statusList = players
    .map((player) => {
      const done = !!game.promptDrafts?.[player.id];
      return `<li>${player.name} — ${done ? 'Submitted' : 'Waiting for prompt'}</li>`;
    })
    .join('');

  render(`
    <div class="card fade-in">
      <div class="status">Round ${game.round} • Prompt Drafting</div>
      ${isHost ? '<h2>Host: collect player prompts</h2>' : '<h2>Write your prompt</h2>'}
      ${isHost
        ? '<p>Each player should fill in their prompt. Once everyone has submitted, press Begin Round.</p>'
        : `<p>Finish the sentence below in your own words.</p><div class="prompt-template">${promptTemplate}</div><textarea id="promptInput" placeholder="Write your finished prompt here...">${myDraft}</textarea><button id="submitPromptBtn">Submit prompt</button>`}
      <div class="card">
        <h3>Prompt status</h3>
        <ul class="list">${statusList}</ul>
      </div>
      ${isHost ? `<button id="beginRoundBtn" ${game.allPromptsSubmitted ? '' : 'disabled'}>Begin Round</button>` : ''}
    </div>
  `);

  if (!isHost) {
    document.getElementById('submitPromptBtn').addEventListener('click', () => {
      const prompt = document.getElementById('promptInput').value.trim();
      socket.emit('submitPrompt', { code: game.code, prompt });
    });
  }

  if (isHost) {
    document.getElementById('beginRoundBtn').addEventListener('click', () => {
      socket.emit('beginRound', { code: game.code });
    });
  }
}

function renderTopicChoice(game) {
  const isAssistant = socket.id === game.assistantId;
  const isSpeaker = socket.id === game.speakerId;
  const topicOptions = game.topicOptions || [];

  render(`
    <div class="card fade-in">
      <div class="status">Round ${game.round} • Prompt Selection</div>
      <div class="roles">
        <span class="tag">Speaker: ${game.speakerName || 'Speaker'}</span>
        <span class="tag">Assistant: ${game.assistantName || 'Assistant'}</span>
      </div>
      <h2>Assistant chooses the prompt</h2>
      <p>Choose one prompt for the speaker to use.</p>
      <div class="grid">
        ${topicOptions.map((topic) => `<button class="topic-btn" data-topic="${topic}">${topic}</button>`).join('')}
      </div>
      ${isAssistant ? '' : '<p class="role-note">The assistant is choosing the prompt now.</p>'}
      ${isSpeaker ? '<p class="role-note">You are the speaker. Wait for the assistant to choose the prompt.</p>' : ''}
    </div>
  `);

  if (isAssistant) {
    document.querySelectorAll('.topic-btn').forEach((button) => {
      button.addEventListener('click', () => {
        socket.emit('chooseTopic', { code: game.code, topic: button.dataset.topic });
      });
    });
  }
}

function renderPlaying(game) {
  const isHost = socket.id === game.hostId;
  const isSpeaker = socket.id === game.speakerId;
  const isAssistant = socket.id === game.assistantId;
  const timer = Math.max(0, game.timerSeconds || 0);
  const slide = game.currentSlide;
  const imageChoices = game.pendingImageOptions || [];
  const nextSlideType = game.slides?.[game.currentSlideIndex + 1]?.type;
  const canChooseImage = isAssistant && game.stage === 'playing' && nextSlideType === 'image';

  const hostView = isHost
    ? `<div class="host-presentation">
        <div class="host-topbar">
          <span class="host-badge">Host View</span>
          <span class="timer-pill">${game.stage === 'countdown' ? `Starts in ${timer}s` : `${timer}s`}</span>
        </div>
        <div class="slide-card big-slide">
          <div class="slide-label">${slide?.subtitle || 'Slide'}</div>
          ${slide?.type === 'image'
            ? `<img class="host-slide-image" src="${slide.imageUrl}" alt="${slide.text}" />
              <div class="slide-body">${slide.text}</div>`
            : `<div class="slide-body">${slide?.text || 'Waiting for prompt...'}</div>`}
        </div>
        <div class="host-footer">
          <span>Speaker: ${game.speakerName || 'Speaker'}</span>
          <span>Assistant: ${game.assistantName || 'Assistant'}</span>
        </div>
      </div>`
    : '';

  const playerView = !isHost
    ? `<div class="card fade-in game-screen">
        <div class="status">Round ${game.round} • <span class="timer-pill">${game.stage === 'countdown' ? `Starts in ${timer}s` : `${timer}s`}</span></div>
        <div class="roles">
          <span class="tag">Speaker: ${game.speakerName || 'Speaker'}</span>
          <span class="tag">Assistant: ${game.assistantName || 'Assistant'}</span>
        </div>

        <div class="slide-card">
          <div class="slide-label">${slide?.subtitle || 'Slide'}</div>
          ${slide?.type === 'image'
            ? `<img class="player-slide-image" src="${slide.imageUrl}" alt="${slide.text}" />
              <div class="slide-body small-body">${slide.text}</div>`
            : `<div class="slide-body">${slide?.text || 'Waiting for prompt...'}</div>`}
        </div>

        ${game.stage === 'countdown' ? '<p class="role-note">The speech starts after the countdown finishes.</p>' : ''}
        ${isSpeaker ? '<p class="role-note">You are the speaker. Decide when to move to the next slide.</p>' : ''}
        ${isSpeaker ? '<button id="nextSlideBtn" class="secondary">Skip to next slide</button>' : ''}
        ${canChooseImage ? '<p class="role-note">Choose the next image for the speaker.</p>' : ''}
        ${canChooseImage ? `<div class="assistant-tools">${imageChoices.map((image) => `<button class="image-option ${game.selectedNextImage?.id === image.id ? 'selected' : ''}" data-image-id="${image.id}"><img src="${image.imageUrl}" alt="${image.label}" /><span>${image.label}</span></button>`).join('')}</div>` : ''}
        ${!isSpeaker && !isAssistant && !isHost ? '<p class="role-note">The audience is watching the speaker and assistant.</p>' : ''}
      </div>`
    : '';

  render(`${hostView || playerView}`);

  if (isSpeaker) {
    document.getElementById('nextSlideBtn').addEventListener('click', () => {
      socket.emit('nextSlide', { code: game.code });
    });
  }

  if (canChooseImage) {
    document.querySelectorAll('.image-option').forEach((button) => {
      button.addEventListener('click', () => {
        socket.emit('chooseImageForNextSlide', { code: game.code, imageId: button.dataset.imageId });
      });
    });
  }
}

function renderRating(game) {
  const isHost = socket.id === game.hostId;
  const canRate = socket.id !== game.speakerId && socket.id !== game.assistantId && socket.id !== game.hostId;
  const myRating = game.ratings[playerId] || 5;

  render(`
    <div class="card fade-in">
      <div class="status">Rating Round</div>
      <h2>Rate the performance</h2>
      <p>Adjust the slider from 0.1 to 10. The average rounded to the nearest tenth becomes the round points.</p>
      <div class="card">
        <h3>Speaker: ${game.speakerName || 'Speaker'}</h3>
        <h3>Assistant: ${game.assistantName || 'Assistant'}</h3>
      </div>
      ${canRate ? `<div class="slider-box"><input id="ratingSlider" type="range" min="0.1" max="10" step="0.1" value="${myRating}" /><div class="rating-value" id="ratingValue">${Number(myRating).toFixed(1)}/10</div></div>` : '<p class="role-note">You are not allowed to vote in this round.</p>'}
      ${isHost ? '<button id="finishRatingsBtn">Finish Ratings</button>' : ''}
    </div>
  `);

  if (canRate) {
    const slider = document.getElementById('ratingSlider');
    const ratingValue = document.getElementById('ratingValue');
    const updateValue = () => {
      ratingValue.textContent = `${Number(slider.value).toFixed(1)}/10`;
      socket.emit('rateRound', { code: game.code, stars: Number(slider.value) });
    };

    slider.addEventListener('input', updateValue);
    slider.addEventListener('change', updateValue);
  }

  if (isHost) {
    document.getElementById('finishRatingsBtn').addEventListener('click', () => {
      socket.emit('finishRatings', { code: game.code });
    });
  }
}

function renderGameOver(game) {
  const winner = game.players.find((player) => player.id === game.winnerId);
  const scoreboard = game.players
    .map((player) => `<li>${player.name}: ${player.score} pts</li>`)
    .join('');

  render(`
    <div class="card fade-in">
      <div class="status">Game Complete</div>
      <h2>Winner: ${winner?.name || 'No winner'}</h2>
      <div class="card">
        <h3>Final Scoreboard</h3>
        <ul class="list">${scoreboard}</ul>
      </div>
      <button id="playAgainBtn">Play Again</button>
    </div>
  `);

  document.getElementById('playAgainBtn').addEventListener('click', () => {
    location.reload();
  });
}

socket.on('gameCreated', (game) => {
  currentGame = game;
  playerId = socket.id;
  playerName = 'Host';
  renderLobby({ ...game, hostId: socket.id });
});

socket.on('joinedGame', ({ code, playerId: id, name }) => {
  playerId = id;
  playerName = name;
});

socket.on('gameUpdated', (game) => {
  currentGame = game;
  if (game.stage === 'lobby') {
    renderLobby(game);
  } else if (game.stage === 'promptDrafting') {
    renderPromptDrafting(game);
  } else if (game.stage === 'topicChoice') {
    renderTopicChoice(game);
  } else if (game.stage === 'countdown' || game.stage === 'playing') {
    renderPlaying(game);
  } else if (game.stage === 'rating') {
    renderRating(game);
  }
});

socket.on('roundStarted', (game) => {
  currentGame = game;
  if (game.stage === 'promptDrafting') {
    renderPromptDrafting(game);
  } else if (game.stage === 'topicChoice') {
    renderTopicChoice(game);
  } else if (game.stage === 'countdown' || game.stage === 'playing') {
    renderPlaying(game);
  }
});

socket.on('ratingOpen', (game) => {
  currentGame = game;
  renderRating(game);
});

socket.on('gameOver', (game) => {
  currentGame = game;
  renderGameOver(game);
});

socket.on('joinFailed', (message) => {
  alert(message);
});

socket.on('notice', (message) => {
  alert(message);
});

showHome();
