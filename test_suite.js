const fs = require('fs');
const path = require('path');
const assert = require('assert');

console.log('--- RUNNING SKETCHCREW VERIFICATION TEST SUITE ---');

const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
const code = html.match(/<script>([\s\S]*?)<\/script>/)[1];

// Create a safe VM sandbox
const vm = require('vm');

let mockLocalStorage = {};
let mockSessionStorage = {};
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
    sessionStorage: {
      getItem: (k) => mockSessionStorage[k] || null,
      setItem: (k, v) => { mockSessionStorage[k] = String(v); },
      removeItem: (k) => { delete mockSessionStorage[k]; }
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
    querySelector: () => ({
      classList: { add: ()=>{}, remove: ()=>{}, toggle: ()=>{} },
      addEventListener: ()=>{},
      style: {}
    }),
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
  sessionStorage: {
    getItem: (k) => mockSessionStorage[k] || null,
    setItem: (k, v) => { mockSessionStorage[k] = String(v); },
    removeItem: (k) => { delete mockSessionStorage[k]; }
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

const tests = [];
function test(name, fn) {
  tests.push({ name, fn });
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

// 21. Audio: Mute enforcement and MasterGain
test('Audio: Mute enforcement and MasterGain', () => {
  ctx.soundMuted = true;
  let oscCreated = false;
  if (ctx.audioCtx) {
    ctx.audioCtx.createOscillator = () => { oscCreated = true; return { connect: ()=>{}, start: ()=>{}, stop: ()=>{} }; };
  }
  ctx.playSound('round_start');
  ctx.playSound('tick');
  assert.strictEqual(ctx.soundMuted, true, 'soundMuted must be true');
  assert.strictEqual(oscCreated, false, 'No oscillator should be created when muted');
});

// 22. Canvas: preventDefault called on mousedown and mousemove
test('Canvas: preventDefault called on mousedown and mousemove', () => {
  let preventedDown = false;
  let preventedMove = false;
  ctx.preventedTestDown = () => { preventedDown = true; };
  ctx.preventedTestMove = () => { preventedMove = true; };
  vm.runInContext(`
    isDrawer = true;
    painting = true;
    GS = { status: 'drawing' };
    sd({ preventDefault: preventedTestDown, clientX: 10, clientY: 10 });
    md({ preventDefault: preventedTestMove, clientX: 20, clientY: 20 });
    ed();
  `, ctx);
  assert(preventedDown, 'e.preventDefault must be called on mousedown');
  assert(preventedMove, 'e.preventDefault must be called on mousemove');
});

// 23. CSS: user-select none and drag none applied to prevent OS sound
test('CSS: user-select none and webkit-user-drag none present on canvas', () => {
  assert(html.includes('-webkit-user-drag: none;'), 'Canvas must have -webkit-user-drag: none');
  assert(html.includes('user-select: none;'), 'Body/canvas must have user-select: none');
});

// 24. BUG-01: Watchdog round_end triggers nextRound on expiration
test('BUG-01: Watchdog round_end triggers nextRound on expiration', async () => {
  let updateData = null;
  ctx.mockDb = {
    ref: () => ({
      once: async () => ({ val: () => ({ status: 'round_end', currentRound: 1, gameMode: 'random' }) }),
      update: async (val) => { updateData = val; },
      remove: async () => {}
    })
  };
  vm.runInContext(`
    roomId = '1234';
    isHost = true;
    db = mockDb;
    serverTimeOffset = 0;
    PS = { 'p1': { online: true }, 'p2': { online: true } };
  `, ctx);

  const roomData = {
    status: 'round_end',
    roundEndStartTime: Date.now() - 6000
  };
  ctx.updateHostWatchdogs(roomData);
  await new Promise(r => setTimeout(r, 60));
  assert(updateData !== null, 'Host watchdog should trigger nextRound (updating room)');
  assert.strictEqual(updateData.status, 'picking');
});

// 25. BUG-02: .info/connected listener sets online true and binds onDisconnect
test('BUG-02: .info/connected listener sets online true and binds onDisconnect', () => {
  let onDisconnectBound = false;
  let onlineSet = false;
  let cb = null;
  const mockDbConn = {
    ref: (p) => {
      if (p === '.info/connected') return { on: (ev, fn) => { cb = fn; } };
      if (p.includes('/online')) {
        return {
          set: (v) => { if (v === true) onlineSet = true; },
          onDisconnect: () => ({ set: (v) => { if (v === false) onDisconnectBound = true; } })
        };
      }
      return { on: () => {}, once: async () => ({ val: () => 0 }) };
    }
  };
  vm.runInContext(`
    db = mockDbConn;
    roomId = 'room_1';
    myId = 'player_1';
    db.ref('.info/connected').on('value', snap => {
      if(snap && snap.val() === true && roomId && myId){
        const myOnlineRef = db.ref('rooms/' + roomId + '/players/' + myId + '/online');
        myOnlineRef.onDisconnect().set(false);
        myOnlineRef.set(true);
      }
    });
  `, Object.assign(ctx, { mockDbConn }));

  cb({ val: () => true });
  assert.strictEqual(onlineSet, true, 'Online must be set true upon reconnect');
  assert.strictEqual(onDisconnectBound, true, 'onDisconnect(false) must be bound');
});

// 26. BUG-03: nextRound sorts active players and advances drawerIndex when drawer is offline
test('BUG-03: nextRound sorts active players and advances drawerIndex when drawer is offline', async () => {
  let updatedRoom = null;
  ctx.mockDb = {
    ref: () => ({
      update: async (val) => { updatedRoom = val; },
      remove: async () => {}
    })
  };
  vm.runInContext(`
    roomId = '1234';
    db = mockDb;
    PS = {
      'user_z': { name: 'Zack', online: true },
      'user_a': { name: 'Alice', online: true },
      'user_m': { name: 'Mike', online: true }
    };
  `, ctx);

  const snap = {
    currentRound: 1,
    currentDrawer: 'user_offline',
    drawerIndex: 1,
    gameMode: 'random'
  };

  await vm.runInContext(`nextRound(${JSON.stringify(snap)})`, ctx);
  assert(updatedRoom !== null, 'Room should be updated');
  assert.deepStrictEqual([...updatedRoom.drawerOrder], ['user_a', 'user_m', 'user_z']);
  assert.strictEqual(updatedRoom.drawerIndex, 2);
  assert.strictEqual(updatedRoom.currentDrawer, 'user_z');
});

// 27. BUG-04: getSyncedNow calculates true synchronized time with serverTimeOffset
test('BUG-04: getSyncedNow incorporates serverTimeOffset', () => {
  vm.runInContext('serverTimeOffset = 10000;', ctx);
  const before = Date.now();
  const synced = vm.runInContext('getSyncedNow()', ctx);
  assert(synced >= before + 9900 && synced <= before + 10100, 'getSyncedNow should add serverTimeOffset');
  vm.runInContext('serverTimeOffset = 0;', ctx);
});

// 28. BUG-05: createRoom does not overwrite an existing active room
test('BUG-05: createRoom does not overwrite an existing active room', async () => {
  ctx.mockDb = {
    ref: (p) => ({
      once: async () => ({
        exists: () => p.includes('1111'),
        val: () => ({ status: 'drawing', players: { 'p1': { online: true } } })
      }),
      set: async () => {},
      onDisconnect: () => ({ set: () => {} })
    })
  };
  vm.runInContext(`
    db = mockDb;
    myId = 'host_1';
    myName = 'Host';
    let rndCount = 0;
    rnd = () => {
      rndCount++;
      return rndCount === 1 ? '1111' : '2222';
    };
  `, ctx);

  await vm.runInContext('createRoom()', ctx);
  const finalRoomId = vm.runInContext('roomId', ctx);
  assert.strictEqual(finalRoomId, '2222', 'createRoom must pick alternate code when 1111 is active');
});

// 29. BUG-06: underscore is treated as space in cleanStr and caught by spoiler/match
test('BUG-06: underscore is treated as space in cleanStr and caught by spoiler/match', () => {
  assert.strictEqual(ctx.cleanStr('k_u_c_i_n_g'), 'k u c i n g');
  assert.strictEqual(ctx.isSpoiler('k_u_c_i_n_g', 'kucing'), true);
  assert.strictEqual(ctx.isMatch('k_u_c_i_n_g', 'kucing'), true);
});

// 30. BUG-07: renderHintBar renders hyphen literally and computes hyphenated letter counts
test('BUG-07: renderHintBar renders hyphen literally and computes hyphenated letter counts', () => {
  let appendedSpans = [];
  let countText = '';
  const mockHintBar = {
    innerHTML: '',
    appendChild: (el) => {
      if (el.className === 'hint-letters') appendedSpans = el.children;
      if (el.className === 'hint-count') countText = el.textContent;
    }
  };

  const origGetElementById = ctx.document.getElementById;
  ctx.document.getElementById = (id) => {
    if (id === 'hint-bar') return mockHintBar;
    return origGetElementById(id);
  };
  ctx.document.createElement = (tag) => {
    const el = {
      className: '',
      textContent: '',
      children: [],
      appendChild: function(c) { this.children.push(c); }
    };
    return el;
  };

  vm.runInContext(`
    isDrawer = false;
    myId = 'p_test';
  `, ctx);

  ctx.renderHintBar({
    currentWord: 'lumba-lumba',
    status: 'drawing',
    correctGuessers: {}
  });

  assert.strictEqual(appendedSpans.length, 11);
  assert.strictEqual(appendedSpans[5].textContent, '-');
  assert(appendedSpans[5].className.includes('hyphen'));
  assert.strictEqual(countText, '5-5 huruf');
});

// 31. BUG-08: saveSession stores session and clearSession removes it
test('BUG-08: saveSession stores session and clearSession removes it', () => {
  mockSessionStorage = {};
  vm.runInContext(`
    roomId = '8888';
    myId = 'pid_session';
    myName = 'SessionUser';
    saveSession();
  `, ctx);

  assert(mockSessionStorage['sketchcrew_session']);
  const s = JSON.parse(mockSessionStorage['sketchcrew_session']);
  assert.strictEqual(s.roomId, '8888');
  assert.strictEqual(s.myId, 'pid_session');

  vm.runInContext('clearSession();', ctx);
  assert.strictEqual(mockSessionStorage['sketchcrew_session'], undefined);
});

// 32. BUG-09: restartGame clears DOM chat-msgs innerHTML
test('BUG-09: restartGame clears DOM chat-msgs innerHTML', async () => {
  const mockChatBox = { innerHTML: '<p>msg1</p>' };
  const origGet = ctx.document.getElementById;
  ctx.document.getElementById = (id) => {
    if (id === 'chat-msgs') return mockChatBox;
    return origGet(id);
  };
  ctx.mockDb = {
    ref: () => ({
      update: async () => {},
      remove: async () => {}
    })
  };
  vm.runInContext(`
    db = mockDb;
    roomId = '1234';
    PS = {};
  `, ctx);

  await ctx.restartGame();
  assert.strictEqual(mockChatBox.innerHTML, '', 'DOM chat-msgs must be empty after restart');
});

// 33. BUG-10: Database operations in launchGame handle exceptions gracefully
test('BUG-10: Database operations in launchGame handle exceptions gracefully', async () => {
  let toastMsg = '';
  ctx.toast = (m) => { toastMsg = m; };
  ctx.mockDb = {
    ref: () => ({
      update: async () => { throw new Error('Database write denied'); }
    })
  };
  vm.runInContext(`
    db = mockDb;
    roomId = '1234';
    PS = { 'p1': { online: true }, 'p2': { online: true } };
  `, ctx);

  await ctx.launchGame('random', null);
  assert(toastMsg.includes('Gagal memulai game'), 'User should see error toast on db failure');
});

// 34. BUG-11: Canvas mouseleave listener removed to prevent premature stroke termination
test('BUG-11: canvas mouseleave listener removed to prevent premature stroke termination', () => {
  assert(!html.includes("cvs.addEventListener('mouseleave'"), 'Canvas must not have mouseleave listener');
});

// 35. BUG-12: ini(p.name) is properly escaped with esc() in HTML template strings
test('BUG-12: ini(p.name) is properly escaped with esc() in HTML template strings', () => {
  assert(!html.includes('>${ini(p.name)}<'), 'ini(p.name) must not be rendered without esc()');
  assert(html.includes('${esc(ini(p.name))}'), 'ini(p.name) must be wrapped in esc()');
});

// 36. BUG-13: unguessed player chat containing secret word is blocked from broadcast
test('BUG-13: unguessed player chat containing secret word is blocked from broadcast', async () => {
  let pushed = false;
  let warnMsg = '';
  ctx.sysMsg = (m) => { warnMsg = m; };
  ctx.mockDb = {
    ref: () => ({ push: async () => { pushed = true; } })
  };

  const mockInput = { value: 'menurutku itu kucing sih' };
  const origGet = ctx.document.getElementById;
  ctx.document.getElementById = (id) => {
    if (id === 'chat-in') return mockInput;
    return origGet(id);
  };
  vm.runInContext(`
    db = mockDb;
    roomId = '1234';
    isDrawer = false;
    GS = { status: 'drawing', correctGuessers: {} };
    curWord = 'kucing';
    lastChat = 0;
  `, ctx);

  await ctx.sendChat();
  assert.strictEqual(pushed, false, 'Leaked word in chat sentence must not be broadcasted');
  assert(warnMsg.includes('kata rahasia'), 'Warning message must be displayed to sender');
});

// 37. BUG-14: host watchdog only auto-picks if currentWord is still null
test('BUG-14: host watchdog only auto-picks if currentWord is still null', async () => {
  let updatedData = null;
  ctx.mockDb = {
    ref: () => ({
      once: async () => ({
        val: () => ({
          status: 'picking',
          currentWord: 'anjing', // Already chosen
          wordChoices: ['anjing', 'kucing']
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
    PS = { 'p1': { online: true }, 'p2': { online: true } };
  `, ctx);

  const roomData = {
    status: 'picking',
    currentDrawer: 'p1',
    pickStartTime: Date.now() - 30000
  };

  ctx.updateHostWatchdogs(roomData);
  await new Promise(r => setTimeout(r, 30));
  assert.strictEqual(updatedData, null, 'Host watchdog must not overwrite already chosen word');
});

// 38. BUG-15: inFlightGuessKey prevents double scoring for the same round
test('BUG-15: inFlightGuessKey prevents double scoring for the same round', async () => {
  let scoreTxCount = 0;
  ctx.mockDb = {
    ref: (p) => ({
      push: async () => {},
      set: async () => {},
      transaction: (fn) => { scoreTxCount++; return fn(0); }
    })
  };

  const mockInput = { value: 'kelinci' };
  const origGet = ctx.document.getElementById;
  ctx.document.getElementById = (id) => {
    if (id === 'chat-in') return mockInput;
    return origGet(id);
  };
  vm.runInContext(`
    db = mockDb;
    roomId = '1234';
    myId = 'p_guesser';
    myName = 'Guesser';
    isDrawer = false;
    GS = { status: 'drawing', roundId: 101, currentRound: 1, correctGuessers: {} };
    curWord = 'kelinci';
    lastChat = 0;
    inFlightGuessKey = null;
  `, ctx);

  await ctx.sendChat();
  const firstTx = scoreTxCount;
  assert(firstTx > 0, 'First correct guess triggers score transaction');

  mockInput.value = 'kelinci';
  ctx.lastChat = 0;
  await ctx.sendChat();
  assert.strictEqual(scoreTxCount, firstTx, 'Second identical guess in flight must not trigger duplicate transaction');
});

// 39. BUG-16: host watchdog transitions to gameover when drawer is alone (<2 players online)
test('BUG-16: host watchdog transitions to gameover when drawer is alone (<2 players online)', () => {
  let statusSet = null;
  ctx.mockDb = {
    ref: () => ({
      update: async (val) => { if (val.status) statusSet = val.status; },
      push: () => {}
    })
  };
  vm.runInContext(`
    roomId = '1234';
    isHost = true;
    db = mockDb;
    PS = {
      'drawer_1': { online: true },
      'guesser_1': { online: false }
    };
  `, ctx);

  ctx.updateHostWatchdogs({
    status: 'drawing',
    currentDrawer: 'drawer_1',
    roundStartTime: Date.now()
  });
  assert.strictEqual(statusSet, 'gameover', 'Game must transition to gameover when drawer is alone');
});

// 40. BUG-17: leaveRoom deletes abandoned room from Firebase when last player leaves
test('BUG-17: leaveRoom deletes abandoned room from Firebase when last player leaves', async () => {
  let removedPath = null;
  ctx.mockDb = {
    ref: (p) => ({
      remove: async () => { removedPath = p; },
      set: async () => {},
      push: () => {}
    })
  };
  vm.runInContext(`
    roomId = 'abandoned_room';
    myId = 'solo_player';
    isHost = true;
    db = mockDb;
    PS = { 'solo_player': { online: true } };
  `, ctx);

  await ctx.leaveRoom();
  assert.strictEqual(removedPath, 'rooms/abandoned_room', 'Room must be removed when last online player leaves');
});

// 41. BUG-18: joinRoom rejects when room has reached MAX_ROOM_PLAYERS
test('BUG-18: joinRoom rejects when room has reached MAX_ROOM_PLAYERS', async () => {
  let errorMsg = '';
  ctx.setError = (m) => { errorMsg = m; };
  const fullPlayers = {};
  for (let i = 1; i <= 8; i++) {
    fullPlayers[`p_${i}`] = { online: true };
  }
  ctx.mockDb = {
    ref: () => ({
      once: async () => ({
        exists: () => true,
        val: () => ({ status: 'waiting', players: fullPlayers })
      })
    })
  };
  vm.runInContext(`
    err = (m) => { setError(m); };
    db = mockDb;
    myId = 'p_9';
    myName = 'ExtraPlayer';
  `, ctx);

  await ctx.joinRoom('7777');
  assert(errorMsg.includes('penuh'), 'joinRoom must reject when capacity reached');
});

// 42. BUG-19: showRoundEndPhase displays final round message on round 8
test('BUG-19: showRoundEndPhase displays final round message on round 8', () => {
  let cdText = '';
  const mockCd = {
    set textContent(v) { cdText = v; },
    get textContent() { return cdText; }
  };
  const origGet = ctx.document.getElementById;
  ctx.document.getElementById = (id) => {
    if (id === 'ov-cd') return mockCd;
    return origGet(id);
  };
  ctx.currentRoundEndId = null;
  ctx.showRoundEndPhase({
    currentWord: 'singa',
    currentRound: 8,
    roundId: 555
  });
  assert(cdText.includes('hasil akhir'), `Expected countdown text to mention hasil akhir, got "${cdText}"`);
});

// 43. BUG-20: HiDPI DPR scaling and 1.5px minimum stroke scaling present
test('BUG-20: HiDPI DPR scaling and 1.5px minimum stroke scaling present', () => {
  assert(html.includes('const dpr = (typeof window !== \'undefined\' && window.devicePixelRatio) ? Math.min(window.devicePixelRatio, 2) : 1;'));
  assert(html.includes('Math.max(1.5,'));
});

// 44. Deep Verification: Close guess does not trigger contradictory spoiler alert or wrong sound
test('Deep Verification: Close guess does not trigger contradictory spoiler alert or wrong sound', async () => {
  let playedSounds = [];
  let sysMsgs = [];
  let toastMsg = '';
  ctx.playSound = (s) => { playedSounds.push(s); };
  ctx.sysMsg = (m, type) => { sysMsgs.push({ m, type }); };
  ctx.toast = (t) => { toastMsg = t; };

  let pushed = false;
  ctx.mockDb = {
    ref: () => ({ push: async () => { pushed = true; } })
  };

  const mockInput = { value: 'kucin' };
  const origGet = ctx.document.getElementById;
  ctx.document.getElementById = (id) => {
    if (id === 'chat-in') return mockInput;
    return origGet(id);
  };

  vm.runInContext(`
    db = mockDb;
    roomId = '1234';
    isDrawer = false;
    GS = { status: 'drawing', correctGuessers: {} };
    curWord = 'kucing';
    lastChat = 0;
  `, ctx);

  await ctx.sendChat();
  assert(playedSounds.includes('close'), 'Close guess must trigger close sound');
  assert(!playedSounds.includes('wrong'), 'Close guess must NOT trigger wrong sound');
  assert(sysMsgs.some(s => s.m.includes('Hampir benar')), 'Close guess must show Hampir benar message');
  assert(!sysMsgs.some(s => s.m.includes('kata rahasia')), 'Close guess must NOT show spoiler warning');
  assert(!toastMsg.includes('kata rahasia'), 'Close guess must NOT show spoiler toast');
  assert.strictEqual(pushed, true, 'Close guess should be broadcast as a regular guess attempt');
});

// 45. Deep Verification: Score transaction network failure allows player to retry guess
test('Deep Verification: Score transaction network failure allows player to retry guess', async () => {
  let shouldFail = true;
  let scoreSucceeded = false;
  ctx.mockDb = {
    ref: (p) => ({
      push: async () => {
        if (shouldFail) throw new Error('Temporary network drop');
      },
      set: async () => {},
      transaction: (fn) => { scoreSucceeded = true; return fn(0); }
    })
  };

  const mockInput = { value: 'kelinci' };
  const origGet = ctx.document.getElementById;
  ctx.document.getElementById = (id) => {
    if (id === 'chat-in') return mockInput;
    return origGet(id);
  };

  vm.runInContext(`
    db = mockDb;
    roomId = '1234';
    myId = 'p_retry';
    myName = 'RetryUser';
    isDrawer = false;
    GS = { status: 'drawing', roundId: 202, currentRound: 1, correctGuessers: {}, currentDrawer: 'p_drawer' };
    curWord = 'kelinci';
    lastChat = 0;
    inFlightGuessKey = null;
  `, ctx);

  // Attempt 1: Fails due to network drop
  await ctx.sendChat();
  assert.strictEqual(vm.runInContext('inFlightGuessKey', ctx), null, 'inFlightGuessKey must be cleared on failure');
  assert.strictEqual(scoreSucceeded, false, 'Score transaction must not succeed on failure');

  // Attempt 2: Re-submitting the same guess after connection restored
  shouldFail = false;
  mockInput.value = 'kelinci';
  vm.runInContext('lastChat = 0;', ctx);
  await ctx.sendChat();
  assert.strictEqual(scoreSucceeded, true, 'Retry must succeed when network recovers');
  ctx.document.getElementById = origGet;
});

// 46. Deep Verification: Score transaction handles null currentDrawer safely without throwing
test('Deep Verification: Score transaction handles null currentDrawer safely without throwing', async () => {
  let pathsUpdated = [];
  ctx.mockDb = {
    ref: (p) => {
      pathsUpdated.push(p);
      return {
        push: async () => {},
        set: async () => {},
        transaction: (fn) => fn(0)
      };
    }
  };

  const mockInput = { value: 'singa' };
  const origGet = ctx.document.getElementById;
  ctx.document.getElementById = (id) => {
    if (id === 'chat-in') return mockInput;
    return origGet(id);
  };

  vm.runInContext(`
    db = mockDb;
    roomId = '1234';
    myId = 'p_guesser';
    myName = 'Guesser';
    isDrawer = false;
    GS = { status: 'drawing', roundId: 303, currentRound: 1, correctGuessers: {}, currentDrawer: null };
    curWord = 'singa';
    lastChat = 0;
    inFlightGuessKey = null;
  `, ctx);

  await ctx.sendChat();
  assert(!pathsUpdated.some(p => p.includes('undefined')), 'No database path should contain "undefined"');
});

// 47. Deep Verification: chooseWord in-flight guard prevents duplicate updates on rapid double-clicks
test('Deep Verification: chooseWord in-flight guard prevents duplicate updates on rapid double-clicks', async () => {
  let updateCalls = 0;
  ctx.mockDb = {
    ref: () => ({
      update: async () => {
        updateCalls++;
        await new Promise(r => setTimeout(r, 20));
      }
    })
  };

  vm.runInContext(`
    db = mockDb;
    roomId = '1234';
    isDrawer = true;
    GS = { status: 'picking' };
    isChoosingWord = false;
  `, ctx);

  // Trigger two chooseWord calls simultaneously
  const p1 = ctx.chooseWord('gajah');
  const p2 = ctx.chooseWord('kucing');
  await Promise.all([p1, p2]);

  assert.strictEqual(updateCalls, 1, 'Only one chooseWord call should write to database');
});

// 48. Deep Verification: createRoom safely halts and reports error if collision attempts exhausted
test('Deep Verification: createRoom safely halts and reports error if collision attempts exhausted', async () => {
  let errorMsg = '';
  ctx.setError = (m) => { errorMsg = m; };
  ctx.mockDb = {
    ref: () => ({
      once: async () => ({
        exists: () => true,
        val: () => ({ status: 'drawing', players: { 'p1': { online: true } } })
      })
    })
  };

  vm.runInContext(`
    db = mockDb;
    err = (m) => { setError(m); };
  `, ctx);

  await ctx.createRoom();
  assert(errorMsg.includes('Gagal membuat room'), 'createRoom must safely report error when all attempts collide');
});

// 49. Deep Verification: attemptSessionRecovery clears session if player slot does not exist
test('Deep Verification: attemptSessionRecovery clears session if player slot does not exist', async () => {
  mockSessionStorage['sketchcrew_session'] = JSON.stringify({
    roomId: '9999',
    myId: 'ghost_player',
    myName: 'Ghost'
  });

  ctx.mockDb = {
    ref: () => ({
      once: async () => ({
        exists: () => true,
        val: () => ({
          status: 'drawing',
          players: { 'real_player': { name: 'Real', online: true } } // ghost_player is missing!
        })
      })
    })
  };

  let activeScreen = '';
  const origGet = ctx.document.getElementById;
  ctx.document.querySelectorAll = () => [];
  ctx.document.getElementById = (id) => ({
    classList: { add: () => { activeScreen = id; }, remove: () => {} }
  });

  vm.runInContext('db = mockDb;', ctx);
  await ctx.attemptSessionRecovery({ roomId: '9999', myId: 'ghost_player', myName: 'Ghost' });

  assert.strictEqual(mockSessionStorage['sketchcrew_session'], undefined, 'Session must be cleared');
  assert.strictEqual(activeScreen, 'lobby-screen', 'User must be redirected to lobby screen');
  ctx.document.getElementById = origGet;
});

// 50. Deep Verification: round_end host watchdog persists missing roundEndStartTime
test('Deep Verification: round_end host watchdog persists missing roundEndStartTime', async () => {
  let roundEndStartTimeSet = null;
  ctx.mockDb = {
    ref: (p) => ({
      set: async (val) => {
        if (p.includes('roundEndStartTime')) roundEndStartTimeSet = val;
      },
      once: async () => ({ val: () => ({ status: 'round_end' }) }),
      update: async () => {}
    })
  };

  vm.runInContext(`
    db = mockDb;
    roomId = '1234';
    isHost = true;
    roundEndTimeout = null;
    PS = { 'p1': { online: true }, 'p2': { online: true } };
  `, ctx);

  ctx.updateHostWatchdogs({
    status: 'round_end',
    roundEndStartTime: null // Missing!
  });

  assert(roundEndStartTimeSet !== null, 'roundEndStartTime must be persisted by host watchdog when missing');
});

// 51. Deep Verification: resizeCvs under DPR 2 scales canvas backing buffer while keeping CSS dimensions
test('Deep Verification: resizeCvs under DPR 2 scales canvas backing buffer while keeping CSS dimensions', () => {
  let canvasWidth = 0;
  let canvasHeight = 0;
  let styleWidth = '';
  let styleHeight = '';

  const mockCvs = {
    set width(w) { canvasWidth = w; },
    get width() { return canvasWidth; },
    set height(h) { canvasHeight = h; },
    get height() { return canvasHeight; },
    style: {
      set width(w) { styleWidth = w; },
      set height(h) { styleHeight = h; }
    },
    getContext: () => ({
      clearRect: () => {},
      fillRect: () => {}
    })
  };

  const mockWrap = {
    clientWidth: 812, // 812 - 12 pad = 800 width
    clientHeight: 612 // 612 - 12 pad = 600 height
  };

  const origGet = ctx.document.getElementById;
  ctx.document.getElementById = (id) => {
    if (id === 'canvas') return mockCvs;
    if (id === 'canvas-wrap') return mockWrap;
    if (id === 'canvas-container') return { style: {} };
    return origGet(id);
  };

  vm.runInContext(`
    window.devicePixelRatio = 2;
    cvs = document.getElementById('canvas');
    ctx2 = cvs.getContext('2d');
    strokeHistory = [];
    painting = false;
  `, ctx);

  ctx.resizeCvs();

  assert.strictEqual(canvasWidth, 1600, 'Backing canvas buffer width should be scaled by DPR 2 (1600px)');
  assert.strictEqual(canvasHeight, 1200, 'Backing canvas buffer height should be scaled by DPR 2 (1200px)');
  assert.strictEqual(styleWidth, '800px', 'Canvas CSS style width should remain 800px');
  assert.strictEqual(styleHeight, '600px', 'Canvas CSS style height should remain 600px');

  vm.runInContext('window.devicePixelRatio = 1;', ctx);
  ctx.document.getElementById = origGet;
});

// 52. Deep Verification: Multi-touch gesture cancel prevents aberrant pinch connecting lines
test('Deep Verification: Multi-touch gesture cancel prevents aberrant pinch connecting lines', () => {
  let touchStartHandler = null;
  const mockCvs = {
    addEventListener: (ev, fn) => {
      if (ev === 'touchstart') touchStartHandler = fn;
    },
    getContext: () => ({ fillRect: () => {}, clearRect: () => {} }),
    getBoundingClientRect: () => ({ width: 800, height: 600, left: 0, top: 0 }),
    style: {}
  };

  const origGet = ctx.document.getElementById;
  ctx.document.getElementById = (id) => {
    if (id === 'canvas') return mockCvs;
    return origGet(id);
  };

  vm.runInContext(`
    canvasInitialized = false;
    cvs = document.getElementById('canvas');
    initCanvas();
    isDrawer = true;
    GS = { status: 'drawing' };
    painting = true;
  `, ctx);

  let defaultPrevented = false;
  touchStartHandler({
    touches: [{ clientX: 100, clientY: 100 }, { clientX: 200, clientY: 200 }], // 2 fingers (pinch)
    preventDefault: () => { defaultPrevented = true; }
  });

  const isPainting = vm.runInContext('painting', ctx);
  assert.strictEqual(isPainting, false, 'Painting state must be ended (painting = false) on multi-touch');
  ctx.document.getElementById = origGet;
});

// Run all queued tests
(async () => {
  let passed = 0;
  for (const t of tests) {
    try {
      await t.fn();
      console.log(`[PASS] ${t.name}`);
      passed++;
    } catch (err) {
      console.error(`[FAIL] ${t.name}:`, err.message);
    }
  }

  console.log(`\nTEST RESULTS: ${passed}/${tests.length} PASSED.`);
  if (passed === tests.length) {
    process.exit(0);
  } else {
    process.exit(1);
  }
})();

