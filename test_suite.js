const fs = require('fs');
const path = require('path');
const assert = require('assert');

console.log('--- RUNNING SKETCHCREW VERIFICATION TEST SUITE ---');

const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
const code = html.match(/<script>([\s\S]*?)<\/script>/)[1];

// Create a safe VM sandbox
const vm = require('vm');

let mockLocalStorage = {};
const dbFunc = () => ({
  ref: () => ({
    set: async () => {},
    update: async () => {},
    remove: async () => {},
    once: async () => ({ exists: () => true, val: () => ({}) }),
    on: () => {},
    off: () => {},
    push: () => ({ key: 'mock_key' }),
    onDisconnect: () => ({ set: () => {} }),
    transaction: (fn) => fn(0)
  })
});
dbFunc.ServerValue = { TIMESTAMP: 1234567890 };
let mockFirebase = {
  initializeApp: () => {},
  database: dbFunc
};

const domMock = {
  window: {
    addEventListener: () => {},
    localStorage: {
      getItem: (k) => mockLocalStorage[k] || null,
      setItem: (k, v) => { mockLocalStorage[k] = v; }
    },
    AudioContext: function() {
      this.state = 'running';
      this.currentTime = 0;
      this.destination = {};
      this.createOscillator = () => ({
        type: 'sine',
        frequency: { setValueAtTime: ()=>{}, exponentialRampToValueAtTime: ()=>{} },
        connect: ()=>{},
        start: ()=>{},
        stop: ()=>{}
      });
      this.createGain = () => ({
        gain: { setValueAtTime: ()=>{}, exponentialRampToValueAtTime: ()=>{}, linearRampToValueAtTime: ()=>{} },
        connect: ()=>{}
      });
    }
  },
  document: {
    querySelectorAll: () => [],
    getElementById: () => ({
      classList: { add: ()=>{}, remove: ()=>{}, toggle: ()=>{} },
      addEventListener: ()=>{},
      style: {},
      textContent: '',
      innerHTML: '',
      appendChild: ()=>{},
      getBoundingClientRect: () => ({ width: 800, height: 600, left: 0, top: 0 }),
      clientWidth: 800,
      clientHeight: 600
    }),
    createElement: (tag) => ({
      className: '',
      textContent: '',
      style: {},
      appendChild: ()=>{},
      getContext: () => ({
        clearRect: ()=>{},
        fillRect: ()=>{},
        beginPath: ()=>{},
        arc: ()=>{},
        fill: ()=>{},
        moveTo: ()=>{},
        lineTo: ()=>{},
        stroke: ()=>{}
      })
    }),
    body: { appendChild: ()=>{} }
  },
  firebase: mockFirebase,
  localStorage: {
    getItem: (k) => mockLocalStorage[k] || null,
    setItem: (k, v) => { mockLocalStorage[k] = v; }
  },
  requestAnimationFrame: () => 1,
  cancelAnimationFrame: () => {},
  setTimeout: setTimeout,
  clearTimeout: clearTimeout,
  setInterval: setInterval,
  clearInterval: clearInterval
};

domMock.window.document = domMock.document;

const ctx = vm.createContext(domMock);
vm.runInContext(code, ctx);

let passed = 0;
let total = 0;
function test(name, fn) {
  total++;
  try {
    fn();
    console.log(`[PASS] ${name}`);
    passed++;
  } catch (err) {
    console.error(`[FAIL] ${name}:`, err.message);
  }
}

// 1. Word matching
test('Match: exact case insensitive', () => {
  assert.strictEqual(ctx.isMatch('Kucing', 'kucing'), true);
});
test('Match: hyphens vs spaces', () => {
  assert.strictEqual(ctx.isMatch('lumba lumba', 'lumba-lumba'), true);
  assert.strictEqual(ctx.isMatch('lumbalumba', 'lumba-lumba'), true);
});
test('Match: extra spaces and punctuation', () => {
  assert.strictEqual(ctx.isMatch('  kucing!  ', 'kucing'), true);
});
test('Match: diacritics / accents', () => {
  assert.strictEqual(ctx.isMatch('café', 'cafe'), true);
});

// 2. Close guess
test('Close: off by 1 letter (length >= 4)', () => {
  assert.strictEqual(ctx.isCloseGuess('kucng', 'kucing'), true);
  assert.strictEqual(ctx.isCloseGuess('kelinici', 'kelinci'), true);
});
test('Close: exact match should NOT be marked close', () => {
  assert.strictEqual(ctx.isCloseGuess('kucing', 'kucing'), false);
});
test('Close: completely wrong guess should NOT be marked close', () => {
  assert.strictEqual(ctx.isCloseGuess('anjing', 'kucing'), false);
});

// 3. Spoiler filter
test('Spoiler: exact word blocked', () => {
  assert.strictEqual(ctx.isSpoiler('kucing', 'kucing'), true);
});
test('Spoiler: sentence containing word blocked', () => {
  assert.strictEqual(ctx.isSpoiler('ini gambar kucing', 'kucing'), true);
});
test('Spoiler: leetspeak blocked', () => {
  assert.strictEqual(ctx.isSpoiler('kuc1ng', 'kucing'), true);
  assert.strictEqual(ctx.isSpoiler('k u c i n g', 'kucing'), true);
});
test('Spoiler: multi-word part blocked', () => {
  assert.strictEqual(ctx.isSpoiler('nasi enak', 'nasi goreng'), true);
});
test('Spoiler: harmless chat allowed', () => {
  assert.strictEqual(ctx.isSpoiler('halo semua selamat bermain', 'kucing'), false);
  assert.strictEqual(ctx.isSpoiler('susah banget digambar', 'gajah'), false);
});

// 4. Aspect ratio math
test('Aspect Ratio: 4:3 calculation on PC (1200x800)', () => {
  const wrapW = 1200 - 12;
  const wrapH = 800 - 12;
  const targetAspect = 4 / 3;
  let targetW, targetH;
  if (wrapW / wrapH > targetAspect) {
    targetH = wrapH;
    targetW = Math.floor(targetH * targetAspect);
  } else {
    targetW = wrapW;
    targetH = Math.floor(targetW / targetAspect);
  }
  const computedAspect = targetW / targetH;
  assert(Math.abs(computedAspect - 4/3) < 0.01, `Aspect ratio was ${computedAspect}`);
  assert(targetW <= wrapW && targetH <= wrapH, 'Should fit inside container');
});

test('Aspect Ratio: 4:3 calculation on Mobile Portrait (390x600)', () => {
  const wrapW = 390 - 12;
  const wrapH = 600 - 12;
  const targetAspect = 4 / 3;
  let targetW, targetH;
  if (wrapW / wrapH > targetAspect) {
    targetH = wrapH;
    targetW = Math.floor(targetH * targetAspect);
  } else {
    targetW = wrapW;
    targetH = Math.floor(targetW / targetAspect);
  }
  const computedAspect = targetW / targetH;
  assert(Math.abs(computedAspect - 4/3) < 0.01, `Aspect ratio was ${computedAspect}`);
  assert(targetW <= wrapW && targetH <= wrapH, 'Should fit inside container');
});

// 5. Host Migration deterministic check
test('Host Migration: elects first active player alphabetically', () => {
  const players = {
    'p_user2': { name: 'Bob', online: true },
    'p_host1': { name: 'Alice', online: false },
    'p_user3': { name: 'Charlie', online: true }
  };
  const currentHost = 'p_host1';
  const isHostOnline = currentHost && players[currentHost] && players[currentHost].online;
  assert.strictEqual(isHostOnline, false);

  const activePlayers = Object.entries(players)
    .filter(([pid, p]) => p && p.online)
    .map(([pid]) => pid)
    .sort();

  assert.strictEqual(activePlayers[0], 'p_user2');
});

// 7. Stroke batching and renderStrokeToContext
test('Stroke Batching: renderStrokeToContext with multi-point batch', () => {
  let strokeCalls = 0;
  let arcCalls = 0;
  const mockCtx = {
    beginPath: () => {},
    moveTo: () => {},
    lineTo: () => {},
    stroke: () => { strokeCalls++; },
    arc: () => { arcCalls++; },
    fill: () => {}
  };
  const batchStroke = {
    pid: 'p_1',
    pts: [[0.1, 0.1], [0.2, 0.2], [0.3, 0.3]],
    color: '#ff0000',
    size: 4
  };
  ctx.renderStrokeToContext(batchStroke, mockCtx, 800, 600);
  assert.strictEqual(strokeCalls, 1, 'Should draw path with connected lineTo calls');

  const dotStroke = {
    pid: 'p_1',
    pts: [[0.5, 0.5]],
    color: '#00ff00',
    size: 6
  };
  ctx.renderStrokeToContext(dotStroke, mockCtx, 800, 600);
  assert.strictEqual(arcCalls, 1, 'Single-point stroke should render as a dot');
});

// 8. Watchdogs: Early round end when all online guessers guessed correctly
test('Watchdog: All online guessers guessed correctly', () => {
  let statusSetTo = null;
  ctx.mockDb = {
    ref: (path) => ({
      set: async (val) => {
        if (path.includes('status')) statusSetTo = val;
      },
      push: () => {}
    })
  };
  vm.runInContext(`
    roomId = '1234';
    isHost = true;
    db = mockDb;
    PS = {
      'p_drawer': { name: 'Drawer', online: true },
      'p_guesser1': { name: 'Player1', online: true },
      'p_guesser2': { name: 'Player2', online: true }
    };
  `, ctx);

  const roomData = {
    status: 'drawing',
    currentDrawer: 'p_drawer',
    correctGuessers: {
      'p_guesser1': true,
      'p_guesser2': true
    }
  };
  ctx.updateHostWatchdogs(roomData);
  assert.strictEqual(statusSetTo, 'round_end', 'Host watchdog should trigger round_end early');
});

// 9. Watchdog: Drawer offline during drawing phase
test('Watchdog: Drawer disconnects during drawing phase', () => {
  let statusSetTo = null;
  ctx.mockDb = {
    ref: (path) => ({
      set: async (val) => {
        if (path.includes('status')) statusSetTo = val;
      },
      push: () => {}
    })
  };
  vm.runInContext(`
    roomId = '1234';
    isHost = true;
    db = mockDb;
    PS = {
      'p_drawer': { name: 'Drawer', online: false },
      'p_guesser1': { name: 'Player1', online: true }
    };
  `, ctx);

  const roomData = {
    status: 'drawing',
    currentDrawer: 'p_drawer',
    correctGuessers: {}
  };
  ctx.updateHostWatchdogs(roomData);
  assert.strictEqual(statusSetTo, 'round_end', 'Host watchdog should end round if drawer disconnects');
});

// 10. Watchdog: Picking timeout watchdog auto-picks word
test('Watchdog: Auto-pick when picking timeout expires', async () => {
  let updatedData = null;
  ctx.mockDb = {
    ref: (path) => ({
      once: async () => ({
        val: () => ({
          status: 'picking',
          wordChoices: ['kucing', 'anjing', 'gajah'],
          currentCategory: '🐾 Hewan'
        })
      }),
      update: async (val) => { updatedData = val; },
      push: () => {}
    })
  };
  vm.runInContext(`
    roomId = '1234';
    isHost = true;
    db = mockDb;
    PS = {
      'p_drawer': { name: 'Drawer', online: true },
      'p_host': { name: 'Host', online: true }
    };
  `, ctx);

  const roomData = {
    status: 'picking',
    currentDrawer: 'p_drawer',
    pickStartTime: Date.now() - 20000 // 20s ago (greater than PICK_DURATION 15s)
  };

  // Call updateHostWatchdogs with mock timer
  ctx.updateHostWatchdogs(roomData);
  // Give time for watchdog
  await new Promise(r => setTimeout(r, 50));
  assert(updatedData !== null, 'Host should auto-update room with auto-picked word');
  assert.strictEqual(updatedData.status, 'drawing');
  assert.strictEqual(updatedData.currentWord, 'kucing');
});

// 11. Host Migration: Active host drops offline, next active player claims host
test('Host Migration: Claims host role when current host goes offline', () => {
  let hostClaimed = null;
  ctx.mockDb = {
    ref: (path) => ({
      set: async (val) => {
        if (path.includes('host')) hostClaimed = val;
      },
      push: () => {}
    })
  };
  vm.runInContext(`
    roomId = '1234';
    myId = 'p_user2';
    myName = 'Bob';
    db = mockDb;
    GS = { host: 'p_host1' };
    PS = {
      'p_host1': { name: 'Alice', online: false },
      'p_user2': { name: 'Bob', online: true },
      'p_user3': { name: 'Charlie', online: true }
    };
  `, ctx);

  ctx.checkHostMigration();
  assert.strictEqual(hostClaimed, 'p_user2', 'p_user2 should claim host because p_host1 is offline');
});

// 12. Spoiler: Leetspeak with symbols (@, !, $, +) blocked
test('Spoiler: leetspeak with symbols (@, !, $, +) blocked', () => {
  assert.strictEqual(ctx.isSpoiler('g@j@h', 'gajah'), true);
  assert.strictEqual(ctx.isSpoiler('kuc!ng', 'kucing'), true);
  assert.strictEqual(ctx.isSpoiler('b@kso', 'bakso'), true);
  assert.strictEqual(ctx.isSpoiler('p!zz@', 'pizza'), true);
});

// 13. Spoiler: Repeated stretched letters blocked
test('Spoiler: repeated stretched letters blocked', () => {
  assert.strictEqual(ctx.isSpoiler('kuuuuucing', 'kucing'), true);
  assert.strictEqual(ctx.isSpoiler('gajaaaah', 'gajah'), true);
  assert.strictEqual(ctx.isSpoiler('kelinnnnci', 'kelinci'), true);
});

// 14. Spoiler: Short word boundary checks (no false positives)
test('Spoiler: short word boundary checks (no false positives)', () => {
  assert.strictEqual(ctx.isSpoiler('pantas', 'tas'), false);
  assert.strictEqual(ctx.isSpoiler('tajam', 'jam'), false);
  assert.strictEqual(ctx.isSpoiler('kertas putih', 'tas'), false);
  assert.strictEqual(ctx.isSpoiler('ini tas merah', 'tas'), true);
  assert.strictEqual(ctx.isSpoiler('t a s', 'tas'), true);
});

// 15. Match: Leetspeak guess matching
test('Match: leetspeak and symbols guess matching', () => {
  assert.strictEqual(ctx.isMatch('kuc!ng', 'kucing'), true);
  assert.strictEqual(ctx.isMatch('b@kso', 'bakso'), true);
  assert.strictEqual(ctx.isMatch('p!zz@', 'pizza'), true);
});

// 16. Host Migration: Does NOT hijack host when host is online in waiting room
test('Host Migration: Does NOT hijack host when host is online in waiting room', () => {
  let hostClaimed = null;
  ctx.mockDb = {
    ref: (path) => ({
      set: async (val) => {
        if (path.includes('host')) hostClaimed = val;
      },
      push: () => {}
    })
  };
  vm.runInContext(`
    roomId = '1234';
    myId = 'p_001';
    myName = 'Bob';
    db = mockDb;
    GS = { host: 'p_host1' };
    PS = {
      'p_host1': { name: 'Alice (Creator/Host)', online: true },
      'p_001': { name: 'Bob (Just Joined)', online: true }
    };
  `, ctx);

  ctx.checkHostMigration();
  assert.strictEqual(hostClaimed, null, 'Bob should NOT hijack host when Alice is online');
});

// 17. Watchdog: Drawing phase timeout watchdog triggers round_end
test('Watchdog: Drawing phase timeout watchdog triggers round_end', () => {
  let statusSetTo = null;
  ctx.mockDb = {
    ref: (path) => ({
      set: async (val) => {
        if (path.includes('status')) statusSetTo = val;
      },
      push: () => {}
    })
  };
  vm.runInContext(`
    roomId = '1234';
    isHost = true;
    db = mockDb;
    PS = {
      'p_drawer': { name: 'Drawer', online: true },
      'p_host': { name: 'Host', online: true }
    };
  `, ctx);

  const roomData = {
    status: 'drawing',
    currentDrawer: 'p_drawer',
    roundStartTime: Date.now() - 65000 // 65s ago (greater than ROUND_DURATION 60s)
  };
  ctx.updateHostWatchdogs(roomData);
  assert.strictEqual(statusSetTo, 'round_end', 'Host watchdog should trigger round_end when drawing time expires');
});

// 18. Round End: Idempotent round end countdown
test('Round End: Idempotent round end does not reset timer on multiple calls', () => {
  ctx.mockDb = {
    ref: () => ({
      once: async () => ({ val: () => ({ status: 'round_end' }) }),
      update: async () => {},
      push: () => {}
    })
  };
  vm.runInContext(`
    roomId = '1234';
    isHost = true;
    db = mockDb;
    currentRoundEndId = null;
    roundEndTimeout = null;
    PS = { 'p_host': { name: 'Host', online: true } };
  `, ctx);

  // First call
  ctx.showRoundEndPhase({ currentWord: 'kucing', currentRound: 1, roundId: 100 });
  const timerAfterFirst = ctx.roundEndTimeout;
  assert(timerAfterFirst !== null, 'Timeout should be scheduled on first call');

  // Second call with same round
  ctx.showRoundEndPhase({ currentWord: 'kucing', currentRound: 1, roundId: 100 });
  const timerAfterSecond = ctx.roundEndTimeout;
  assert.strictEqual(timerAfterFirst, timerAfterSecond, 'Timeout should NOT be reset on subsequent updates');
});

// 19. Canvas: gpos zero division safeguard
test('Canvas: gpos zero division safeguard', () => {
  vm.runInContext(`cvs = { getBoundingClientRect: () => ({ width: 0, height: 0, left: 0, top: 0 }) };`, ctx);
  const pos = ctx.gpos({ clientX: 100, clientY: 100 });
  assert.strictEqual(pos.x, 0);
  assert.strictEqual(pos.y, 0);
  assert(!isNaN(pos.x));
  assert(!isNaN(pos.y));
});

// 20. UI: Scores panel has mobile-hidden class by default in HTML
test('UI: Scores panel has mobile-hidden class by default in HTML', () => {
  assert(html.includes('<div class="scores mobile-hidden" id="scores-panel">'), 'Scores panel must have mobile-hidden class by default');
});

console.log(`\nTEST RESULTS: ${passed}/${total} PASSED.`);
if (passed === total) {
  process.exit(0);
} else {
  process.exit(1);
}

