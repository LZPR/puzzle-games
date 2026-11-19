import './nonogram.js';

const games = new Map([
  ['nonogram', {
    title: '数织',
    english: 'NONOGRAM',
    element: 'nonogram-game',
    description: '用行列提示找出藏在棋盘里的像素图案。',
    sprite: [
      '..X....X..',
      '...X..X...',
      '..XXXXXX..',
      '.XX.XX.XX.',
      'XXXXXXXXXX',
      'X.XXXXXX.X',
      'X.X....X.X',
      '...XX.XX..',
    ],
    help: [
      '每组数字代表同行或同列中一段连续方块的长度。数字按从左到右、从上到下排列。',
      '两段方块之间至少空一格。用「填充」涂色方格，用「标叉」标记空格。',
      '点击或拖动即可操作方格，也可以右键标叉。检查答案会告诉你是否已经解开谜题。',
    ],
  }],
]);

const icons = {
  grid: '<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/>',
  sound: '<path d="M3 9h4l5-4v14l-5-4H3z"/><path d="M16 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/>',
  mute: '<path d="M3 9h4l5-4v14l-5-4H3zM16 9l6 6m0-6-6 6"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9 9a3 3 0 1 1 4 3c-1 .5-1 1-1 2m0 3h.01"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  moves: '<path d="M4 16l5-5 4 3 7-8m-5 0h5v5"/>',
  gamepad: '<path d="M7 7h10c3 0 4 2 5 7l.2 2a2.5 2.5 0 0 1-4 2L15 15H9l-3.2 3a2.5 2.5 0 0 1-4-2l.2-2c1-5 2-7 5-7zM6 11h4m-2-2v4m8-1h.01m3-2h.01"/>',
  fill: '<rect x="5" y="5" width="14" height="14" fill="currentColor"/>',
  cross: '<path d="m6 6 12 12M18 6 6 18"/>',
  erase: '<path d="m4 14 9-9a2 2 0 0 1 3 0l4 4a2 2 0 0 1 0 3l-7 7H9l-5-3a1 1 0 0 1 0-2zm5-5 7 7m-3 3h8"/>',
  undo: '<path d="m9 6-5 5 5 5m-5-5h11a5 5 0 0 1 0 10"/>',
  redo: '<path d="m15 6 5 5-5 5m5-5H9a5 5 0 0 0 0 10"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  reset: '<path d="M4 10a8 8 0 1 1 1 7M4 4v6h6"/>',
  next: '<path d="M4 12h15m-6-6 6 6-6 6"/>',
};

const icon = (name, size = 20) => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name]}</svg>`;

function sprite(pixels, className) {
  return `<span class="${className}" aria-hidden="true" style="--pixels:${pixels[0].length}">${pixels.flatMap(row => [...row].map(pixel => `<i data-pixel="${pixel}"></i>`)).join('')}</span>`;
}

const logo = sprite(['.LL.', 'LLLL', '.LMY', 'MMYY'], 'brand-pixels');

const button = (command, label, style = '') =>
  `<button type="button" class="button ${style}" data-command="${command}">${icon(command, 18)}<span>${label}</span></button>`;

const toolButton = (command, label, style = '') =>
  `<button type="button" class="button tool-button ${style}" data-command="${command}" aria-pressed="${command === 'fill'}">${icon(command, 22)}<span>${label}</span></button>`;

class PuzzleArcade extends HTMLElement {
  connectedCallback() {
    this.addEventListener('click', this.handleClick);
    this.addEventListener('game-state', this.updateState);
    window.addEventListener('hashchange', this.route);
    this.route();
  }

  disconnectedCallback() {
    this.removeEventListener('click', this.handleClick);
    this.removeEventListener('game-state', this.updateState);
    window.removeEventListener('hashchange', this.route);
  }

  route = () => {
    const route = location.hash.slice(1);
    this.render(games.has(route) || route === 'lobby' ? route : 'nonogram');
  };

  render(route) {
    const game = games.get(route);
    document.title = game ? `${game.title} · 方块街机` : '游戏大厅 · 方块街机';
    this.innerHTML = `
      <header class="site-header">
        <div class="header-content">
          <a class="brand" href="#lobby">${logo}<span><strong>方块街机</strong><small>PUZZLE ARCADE</small></span></a>
          <nav aria-label="主导航">
            <a class="button lobby-button" href="#lobby">${icon('grid', 15)}<span>游戏大厅</span></a>
            <button class="button sound-button" type="button" data-action="sound" aria-label="声音" aria-pressed="${Boolean(this.soundEnabled)}">${icon(this.soundEnabled ? 'sound' : 'mute', 19)}</button>
          </nav>
        </div>
      </header>
      ${game ? this.gameMarkup(game) : this.lobbyMarkup()}
      <footer class="site-footer"><span>方块街机</span><i aria-hidden="true"></i><span>PUZZLE ARCADE</span></footer>
    `;
    this.board = this.querySelector(game?.element ?? 'nonogram-game');
  }

  gameMarkup(game) {
    return `
      <main class="shell">
        <div class="game-intro">
          <div class="game-identity">
            <div class="sprite-frame">${sprite(game.sprite, 'game-pixels')}</div>
            <div><h1>${game.title}</h1><p>${game.english}</p></div>
          </div>
          <button class="button help-button" type="button" data-action="help">${icon('help', 17)}<span>游戏玩法</span></button>
        </div>
        <div class="game-layout">
          <section class="panel game-panel" aria-label="数织棋盘">
            <div class="game-panel-header">
              <div class="panel-title"><span class="panel-lights" aria-hidden="true"><i></i><i></i><i></i></span><h2>数织棋盘</h2></div>
              <span class="puzzle-label" data-status="puzzle">关卡 01</span>
            </div>
            <div class="board-body"><${game.element}></${game.element}></div>
            <div class="board-footer">
              <span><i class="legend-square" aria-hidden="true"></i>填充</span>
              <span><i class="legend-cross" aria-hidden="true">×</i>标叉</span>
              <span><i class="legend-empty" aria-hidden="true"></i>空白</span>
            </div>
          </section>
          <aside class="sidebar" aria-label="游戏状态与操作">
            <section class="panel sidebar-panel status-panel">
              <div class="aside-heading"><div class="status-dot" aria-hidden="true"></div><h2>游戏状态</h2><span data-status="size" class="size-label"></span></div>
              <div class="status-grid">
                <div class="metric"><span>${icon('clock', 16)}计时</span><strong data-status="time">00:00</strong></div>
                <div class="metric"><span>${icon('moves', 16)}步数</span><strong data-status="moves">0</strong></div>
              </div>
              <div class="progress-label"><span>填充进度</span><strong data-status="progress-label">0 / 0</strong></div>
              <progress data-status="progress" value="0" max="1" aria-label="填充进度"></progress>
            </section>
            <section class="panel sidebar-panel control-panel">
              <div class="aside-heading">${icon('gamepad', 21)}<h2>操作面板</h2></div>
              <div class="tool-row" role="group" aria-label="绘制工具">
                ${toolButton('fill', '填充', 'lavender')}
                ${toolButton('cross', '标叉', 'peach')}
                ${toolButton('erase', '擦除', 'yellow')}
              </div>
              <div class="history-row">
                ${button('undo', '撤销')}
                ${button('redo', '重做')}
              </div>
              <div class="play-actions">
                ${button('check', '检查答案', 'mint check-button')}
                <div class="history-row">
                  ${button('reset', '重置')}
                  ${button('next', '下一关', 'next-button')}
                </div>
              </div>
              <p class="board-message" data-status="message" role="status"></p>
            </section>
          </aside>
        </div>
      </main>
      <dialog class="panel" aria-labelledby="help-title">
        <h2 id="help-title">游戏玩法</h2>
        <ol>${game.help.map(step => `<li>${step}</li>`).join('')}</ol>
        <form method="dialog"><button class="button lavender">开始游戏</button></form>
      </dialog>
    `;
  }

  lobbyMarkup() {
    return `
      <main class="shell lobby">
        <div class="game-intro"><div class="game-identity"><div class="sprite-frame lobby-frame">${logo}</div><div><h1>游戏大厅</h1><p>PUZZLE ARCADE</p></div></div></div>
        <div class="game-library">${Array.from(games, ([id, game]) => `
          <a href="#${id}" class="panel library-card">
            <div class="sprite-frame">${sprite(game.sprite, 'game-pixels')}</div>
            <div><h2>${game.title}</h2><p>${game.description}</p></div>${icon('next')}
          </a>
        `).join('')}</div>
      </main>
    `;
  }

  handleClick = (event) => {
    const button = event.target.closest('button');
    if (!button) return;
    const { command, action } = button.dataset;
    if (action === 'sound') {
      this.soundEnabled = !this.soundEnabled;
      button.innerHTML = icon(this.soundEnabled ? 'sound' : 'mute', 19);
      button.setAttribute('aria-pressed', this.soundEnabled);
      this.playSound();
    }
    if (action === 'help') this.querySelector('dialog').showModal();
    if (command) {
      this.board?.command(command);
      this.playSound(command === 'check' ? 600 : 460);
    }
  };

  updateState = ({ detail }) => {
    const status = name => this.querySelector(`[data-status="${name}"]`);
    if (!status('time')) return;
    const { elapsed = 0, moves = 0, size, tool, canUndo, canRedo, won, puzzleIndex = 0, puzzleCount, filled = 0, total = 0, message = '' } = detail;
    const time = Math.max(0, Math.floor(elapsed));
    const pad = value => String(value).padStart(2, '0');
    if (this.previousMoves !== undefined && this.previousMoves !== moves && moves > 0) this.playSound(420);
    this.previousMoves = moves;
    status('time').textContent = `${pad(Math.floor(time / 60))}:${pad(time % 60)}`;
    status('moves').textContent = moves;
    status('size').textContent = size ? `${size} × ${size}` : '';
    status('puzzle').textContent = `关卡 ${pad(puzzleIndex + 1)}`;
    status('puzzle').setAttribute('aria-label', `第 ${puzzleIndex + 1} 关，共 ${puzzleCount} 关`);
    this.querySelector('.game-panel').toggleAttribute('data-solved', won);
    status('progress-label').textContent = `${filled} / ${total}`;
    status('progress').max = total || 1;
    status('progress').value = filled;
    if (status('message').textContent !== message) status('message').textContent = message;
    for (const button of this.querySelectorAll('.tool-button')) button.setAttribute('aria-pressed', button.dataset.command === tool);
    this.querySelector('[data-command="undo"]').disabled = !canUndo;
    this.querySelector('[data-command="redo"]').disabled = !canRedo;
  };

  playSound(frequency = 480) {
    if (!this.soundEnabled || !window.AudioContext) return;
    this.audio ??= new AudioContext();
    if (this.audio.state === 'suspended') this.audio.resume().catch(() => {});
    const tone = this.audio.createOscillator();
    const volume = this.audio.createGain();
    const now = this.audio.currentTime;
    tone.type = 'square';
    tone.frequency.value = frequency;
    volume.gain.setValueAtTime(0.025, now);
    volume.gain.exponentialRampToValueAtTime(0.001, now + 0.07);
    tone.connect(volume).connect(this.audio.destination);
    tone.start();
    tone.stop(now + 0.07);
  }
}

customElements.define('puzzle-arcade', PuzzleArcade);



