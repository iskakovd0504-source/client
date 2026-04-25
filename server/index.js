require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const crypto = require('crypto');
const fs = require('fs');
const Database = require('better-sqlite3');

const app = express();
const server = http.createServer(app);

// --- CORS CONFIGURATION ---
const ALLOWED_ORIGINS = [
  'https://cryptomarket.kz',
  'https://www.cryptomarket.kz',
  'http://localhost:3000'
];

const io = new Server(server, {
  cors: {
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile apps or curl)
      if (!origin) return callback(null, true);
      if (ALLOWED_ORIGINS.indexOf(origin) !== -1 || process.env.NODE_ENV === 'development') {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
    methods: ["GET", "POST"]
  }
});

// --- DATABASE INITIALIZATION ---
const DB_PATH = './game.db';
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL'); // Mode for high performance with concurrent connections

// Create Tables
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    nickname TEXT PRIMARY KEY,
    points INTEGER DEFAULT 0,
    isPremium INTEGER DEFAULT 0,
    deviceId TEXT,
    hashedSecret TEXT
  );
  CREATE TABLE IF NOT EXISTS billboards (
    id INTEGER PRIMARY KEY,
    x REAL,
    z REAL,
    rotY REAL,
    text TEXT,
    color TEXT,
    type INTEGER,
    expiresAt INTEGER,
    prices TEXT
  );
`);

// MIGRATION FROM JSON
const JSON_DB_FILE = './database.json';
if (fs.existsSync(JSON_DB_FILE)) {
    console.log("[DB] Found legacy JSON database. Migrating...");
    try {
        const data = JSON.parse(fs.readFileSync(JSON_DB_FILE, 'utf-8'));
        const users = data.users || {};
        const billboards = data.billboards || [];

        const insertUser = db.prepare('INSERT OR REPLACE INTO users (nickname, points, isPremium, deviceId, hashedSecret) VALUES (?, ?, ?, ?, ?)');
        const insertBillboard = db.prepare('INSERT OR REPLACE INTO billboards (id, x, z, rotY, text, color, type, expiresAt, prices) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');

        db.transaction(() => {
            for (const [nick, user] of Object.entries(users)) {
                insertUser.run(nick, user.points || 0, user.isPremium ? 1 : 0, user.deviceId, user.hashedSecret);
            }
            for (const b of billboards) {
                insertBillboard.run(b.id, b.x, b.z, b.rotY, b.text, b.color, b.type, b.expiresAt, JSON.stringify(b.prices));
            }
        })();

        fs.renameSync(JSON_DB_FILE, JSON_DB_FILE + '.bak');
        console.log("[DB] Migration complete! database.json moved to .bak");
    } catch (e) {
        console.error("[DB] Migration failed:", e);
    }
}

// --- GAME STATE ---
const players = {};
let droppedCargos = []; 

// Load Billboards into memory for fast broadcasting
const loadBillboards = db.prepare('SELECT * FROM billboards');
let billboards = loadBillboards.all().map(b => ({
    ...b,
    prices: JSON.parse(b.prices || '{}')
}));

// If no billboards, initialize
if (billboards.length < 101) {
    console.log("[DB] Initializing billboards...");
    const neonColors = ['#eab308', '#14F195', '#ff00ff', '#00ffff', '#ff4500', '#00bbff'];
    const premiumPrice = JSON.stringify({ 1: 5000, 7: 20000, 30: 50000 });
    const basicPrice = JSON.stringify({ 1: 1000, 7: 4000, 30: 10000 });
    
    const insertBB = db.prepare('INSERT OR REPLACE INTO billboards (id, x, z, rotY, text, color, type, expiresAt, prices) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
    
    db.transaction(() => {
        for (let i = 0; i < 270; i++) {
            let x = (Math.random() - 0.5) * 7800;
            let z = (Math.random() * 4500) - 3800;
            const type = i % 3 === 0 ? (i % 6 === 0 ? 1 : 0) : 2;
            const color = neonColors[i % neonColors.length];
            const prices = (type === 1 || type === 0) ? premiumPrice : basicPrice;
            
            insertBB.run(i, x, z, Math.random() * Math.PI * 2, `AD SPACE #${i}`, color, type, null, prices);
        }
    })();
    billboards = loadBillboards.all().map(b => ({ ...b, prices: JSON.parse(b.prices || '{}') }));
}

function updateBillboardInDB(bb) {
    const stmt = db.prepare('UPDATE billboards SET text = ?, color = ?, expiresAt = ? WHERE id = ?');
    stmt.run(bb.text, bb.color, bb.expiresAt, bb.id);
}

function updateUserPoints(nick, points) {
    const stmt = db.prepare('UPDATE users SET points = ? WHERE nickname = ? AND points < ?');
    stmt.run(points, nick, points);
}

function updateUserPremium(nick, isPremium) {
    const stmt = db.prepare('UPDATE users SET isPremium = ? WHERE nickname = ?');
    stmt.run(isPremium ? 1 : 0, nick);
}

// --- RATE LIMITING ---
const rateLimits = {}; // socketId -> { action: timestamp }

function checkRateLimit(socketId, action, ms) {
    if (!rateLimits[socketId]) rateLimits[socketId] = {};
    const now = Date.now();
    if (rateLimits[socketId][action] && (now - rateLimits[socketId][action]) < ms) {
        return false;
    }
    rateLimits[socketId][action] = now;
    return true;
}

const CARGO_TYPES = ['Solana Validator Node', 'Saga Mobile (Batch 2)', 'Dedicated RPC Cluster', 'Genesis Block Snapshot', 'Jito-MEV Accelerator'];

const ALATAU_Z = -3500;
const DELIVERY_POINTS = [
  { id: 'f1', x: 0, z: ALATAU_Z, rot: 0 },
  { id: 'f2', x: -2000, z: ALATAU_Z, rot: 0 },
  { id: 'f3', x: 2000, z: ALATAU_Z, rot: 0 },
  { id: 'l1', x: -3800, z: -2500, rot: Math.PI / 2 },
  { id: 'l2', x: -3800, z: -1000, rot: Math.PI / 2 },
  { id: 'l3', x: -3800, z: 500, rot: Math.PI / 2 },
  { id: 'r1', x: 3800, z: -2500, rot: -Math.PI / 2 },
  { id: 'r2', x: 3800, z: -1000, rot: -Math.PI / 2 },
  { id: 'r3', x: 3800, z: 500, rot: -Math.PI / 2 },
];

function getRandomCargo() {
    return [CARGO_TYPES[Math.floor(Math.random() * CARGO_TYPES.length)]];
}
// --- SPATIAL GRID SETTINGS ---
const GRID_SIZE = 1000;
const grid = {}; // cellId -> Set of socketIds

function getCellId(pos) {
    if (!pos) return '0,0';
    const gx = Math.floor(pos[0] / GRID_SIZE);
    const gz = Math.floor(pos[2] / GRID_SIZE);
    return `${gx},${gz}`;
}

function updatePlayerGrid(socketOrId, newPos) {
    const isSocket = typeof socketOrId === 'object' && socketOrId.id;
    const socketId = isSocket ? socketOrId.id : socketOrId;
    const oldCell = players[socketId]?.cell;
    const newCell = getCellId(newPos);
    
    if (oldCell !== newCell) {
        if (oldCell && grid[oldCell]) {
            grid[oldCell].delete(socketId);
            if (isSocket) socketOrId.leave(oldCell); 
        }
        if (!grid[newCell]) grid[newCell] = new Set();
        grid[newCell].add(socketId);
        if (isSocket) socketOrId.join(newCell);
        
        if (players[socketId]) players[socketId].cell = newCell;
        return { oldCell, newCell };
    }
    return null;
}

function getNearbyCells(cellId) {
    if (!cellId) return [];
    const [cx, cz] = cellId.split(',').map(Number);
    let cells = [];
    for (let x = cx - 1; x <= cx + 1; x++) {
        for (let z = cz - 1; z <= cz + 1; z++) {
            cells.push(`${x},${z}`);
        }
    }
    return cells;
}

function broadcastToNearby(socket, event, data) {
    const p = players[socket.id];
    if (!p || !p.cell) return;
    const rooms = getNearbyCells(p.cell);
    socket.to(rooms).emit(event, data);
}

// Collector of dropped items
setInterval(() => {
    const now = Date.now();
    const beforeCount = droppedCargos.length;
    droppedCargos = droppedCargos.filter(c => (now - (c.timestamp || now)) < 600000); // 10 mins
    if (droppedCargos.length !== beforeCount) {
        io.emit('cargoState', droppedCargos);
    }
}, 60000);

const checkExpirations = () => {
    const now = Date.now();
    billboards.forEach(b => {
        if (b.expiresAt && now > b.expiresAt) {
            b.text = `AD SPACE #${b.id}`; b.expiresAt = null;
            const neonColors = ['#eab308', '#14F195', '#ff00ff', '#00ffff', '#ff4500'];
            b.color = neonColors[b.id % neonColors.length];
            updateBillboardInDB(b);
            io.emit('billboardUpdate', b); // Теперь данные передаются как в БД (x, z, rotY)
        }
    });
};
setInterval(checkExpirations, 60000);


// Bots Init
for (let i = 1; i <= 4; i++) {
  const botId = 'bot_' + i;
  players[botId] = {
    id: botId, nickname: 'CargoBot ' + i, position: [(Math.random() - 0.5) * 400, 0, 100 - i * 150],
    rotation: [0, 0, 0], points: 15 * i, cargo: getRandomCargo()
  };
  updatePlayerGrid(botId, players[botId].position);
}

// Оптимизированный цикл ботов (теперь через Grid)
setInterval(() => {
  for (let i = 1; i <= 4; i++) {
    const botId = 'bot_' + i;
    const bot = players[botId];
    if (!bot) continue;
    if (bot.cargo && bot.cargo.length > 0) {
      bot.position[2] -= 0.55; 
      bot.position[0] += Math.sin(Date.now() / (1000 + i*512)) * 0.4;
      bot.rotation[1] = Math.PI + Math.sin(Date.now() / (1000 + i*512)) * 0.1;
      
      const moved = updatePlayerGrid(botId, bot.position);
      const rooms = getNearbyCells(bot.cell);
      if (moved) {
          const oldRooms = getNearbyCells(moved.oldCell);
          io.to(oldRooms).emit('playerLeft', botId);
          io.to(rooms).emit('playerJoined', bot);
      } else {
          io.to(rooms).emit('playerMoved', bot);
      }
      
      if (bot.position[2] < -3200) {
        bot.position[2] = 200; bot.position[0] = (Math.random() - 0.5) * 400;
        bot.cargo = getRandomCargo();
        bot.points += 15;
        updatePlayerGrid(botId, bot.position);
        io.to(rooms).emit('playerUpdated', bot);
      }
    } else {
      // КЕЙС: Бота подбили и он пустой. Респавним его на старт!
      bot.position = [(Math.random() - 0.5) * 400, 0, 200];
      bot.cargo = getRandomCargo();
      updatePlayerGrid(botId, bot.position);
      const rooms = getNearbyCells(bot.cell);
      io.to(rooms).emit('playerUpdated', bot);
    }
  }
}, 50);






const ADMIN_KEY = process.env.ADMIN_KEY;

let pendingRequests = []; 
let pendingPremiumRequests = []; 

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);
  players[socket.id] = { id: socket.id, nickname: 'Anon', position: [0, 0, 200], rotation: [0, 0, 0], points: 0, cargo: null, isPremium: false };
  updatePlayerGrid(socket.id, [0, 0, 200]);

  socket.on('join', (data) => {
    if (!checkRateLimit(socket.id, 'join', 1000)) return;
    const originalNickname = (data.nickname || 'Anon').trim().replace(/[^a-zA-Z0-9_А-яЁё \-]/g, '');
    let finalNickname = originalNickname;
    if (finalNickname.length < 2) finalNickname = 'Pilot_' + socket.id.substring(0,4);
    if (finalNickname.length > 15) finalNickname = finalNickname.substring(0, 15);

    const normalizedNick = finalNickname.toLowerCase();
    const deviceId = data.deviceId;
    const secretInput = data.password || data.deviceId;
    const hashedSecret = crypto.createHash('sha256').update(secretInput).digest('hex');
    
    const isAdminNick = normalizedNick.includes('admin') || normalizedNick.includes('админ');
    
    if (isAdminNick && data.password !== ADMIN_KEY) {
        socket.emit('gameNotification', { message: '⛔ Admin access restricted!', type: 'error' });
        return;
    }

    const getUser = db.prepare('SELECT * FROM users WHERE nickname = ?');
    const existingUser = getUser.get(normalizedNick);

    if (existingUser) {
        if (existingUser.hashedSecret !== hashedSecret && existingUser.deviceId !== deviceId) {
            socket.emit('authRequired', { nickname: finalNickname });
            return;
        }
        players[socket.id].points = existingUser.points || 0;
        players[socket.id].isPremium = existingUser.isPremium === 1;
    } else {
        const insertUser = db.prepare('INSERT INTO users (nickname, hashedSecret, deviceId, points, isPremium) VALUES (?, ?, ?, ?, ?)');
        insertUser.run(normalizedNick, hashedSecret, deviceId, 0, 0);
        socket.emit('registrationSuccess', { accessId: deviceId });
        players[socket.id].points = 0;
        players[socket.id].isPremium = false;
    }

    const p = players[socket.id];
    p.nickname = finalNickname;
    if (!p.cargo) p.cargo = getRandomCargo();
    p.deviceId = deviceId;
    p.ignoreNextMove = true; 

    socket.emit('joinSuccess', p);

    // Вместо рассылки ВСЕХ - уведомляем только соседей, что мы зашли
    const rooms = getNearbyCells(p.cell);
    io.to(rooms).emit('playerJoined', p);
    
    // Самому игроку шлем список ТОЛЬКО тех, кто рядом
    let nearbyPlayers = {};
    rooms.forEach(rid => {
        if (grid[rid]) {
            grid[rid].forEach(sid => { if (players[sid]) nearbyPlayers[sid] = players[sid]; });
        }
    });
    socket.emit('initialNearbyPlayers', nearbyPlayers);

    socket.emit('cargoState', droppedCargos);
    socket.emit('billboardState', billboards);
    if (finalNickname === 'Admin') {
        socket.emit('pendingState', pendingRequests);
        socket.emit('pendingPremiumState', pendingPremiumRequests);
    }
  });

  socket.on('restockCargo', () => {
    if (!checkRateLimit(socket.id, 'restock', 5000)) return;
    const p = players[socket.id];
    if (p && (!p.cargo || p.cargo.length === 0)) {
        const distToStart = Math.hypot(p.position[0] - 0, p.position[2] - 50);
        if (distToStart < 300) {
            p.cargo = getRandomCargo();
            broadcastToNearby(socket, 'playerUpdated', p);
        }
    }
  });

  socket.on('move', (data) => {
    const p = players[socket.id];
    if (p) {
      if (!Array.isArray(data.position) || data.position.length < 3) return;
      data.position[1] = 0; // ПРИЗЕМЛЯЕМ ЧИТЕРА: Запрещаем полет по оси Y
      
      // АНТИ-ТЕЛЕПОРТ ПРОВЕРКА
      const dx = data.position[0] - p.position[0];
      const dz = data.position[2] - p.position[2];
      const distSq = dx*dx + dz*dz;
      
      if (p.ignoreNextMove) {
          p.ignoreNextMove = false; // Сбрасываем флаг и разрешаем это движение
      } else if (distSq > 500*500 && p.nickname !== 'Admin') {
          console.log(`[SECURITY] Teleport detected for ${p.nickname}. Blocking.`);
          socket.emit('authoritativeRespawn', { position: p.position, cargo: p.cargo });
          return;
      }

      p.position = data.position;
      p.rotation = data.rotation;
      
      const oldCell = p.cell;
      const gridChange = updatePlayerGrid(socket, data.position);
      
      if (gridChange) {
          const rooms = getNearbyCells(p.cell);
          let nearbyPlayers = {};
          rooms.forEach(rid => {
              if (grid[rid]) {
                  grid[rid].forEach(sid => { if (players[sid]) nearbyPlayers[sid] = players[sid]; });
              }
          });
          socket.emit('initialNearbyPlayers', nearbyPlayers);
          
          const oldRooms = getNearbyCells(gridChange.oldCell);
          io.to(oldRooms).emit('playerLeft', socket.id);
          io.to(rooms).emit('playerJoined', p);
      } else {
          broadcastToNearby(socket, 'playerMoved', p);
      }
    }
  });

  socket.on('hit', (targetId) => {
    if (!checkRateLimit(socket.id, 'hit', 1200)) return;
    const target = players[targetId];
    const shooter = players[socket.id];
    if (!target || !shooter) return;
    if (target.nickname === 'Admin') return;
    
    const dist = Math.hypot(shooter.position[0] - target.position[0], shooter.position[2] - target.position[2]);
    if (dist < 400 && target.cargo && target.cargo.length > 0) {
      const droppedItem = target.cargo.pop();
      const drop = { id: Date.now() + Math.random(), x: target.position[0], z: target.position[2], type: droppedItem, timestamp: Date.now() };
      droppedCargos.push(drop);
      io.emit('cargoDropped', drop); 
      const rooms = getNearbyCells(target.cell);
      io.to(rooms).emit('playerUpdated', target);
    }
  });

  socket.on('pickup', (cargoId) => {
    if (!checkRateLimit(socket.id, 'pickup', 1000)) return;
    const idx = droppedCargos.findIndex(c => c.id === cargoId);
    if (idx !== -1) {
      const cargo = droppedCargos[idx];
      const p = players[socket.id];
      const dist = Math.hypot(p.position[0] - cargo.x, p.position[2] - cargo.z);
      if (dist < 40) {
          if (!p.cargo) p.cargo = [];
          p.cargo.push(cargo.type);
          droppedCargos.splice(idx, 1);
          io.emit('cargoPicked', cargoId);
          const rooms = getNearbyCells(p.cell);
          io.to(rooms).emit('playerUpdated', p);
      }
    }
  });

  socket.on('deliver', () => {
    if (!checkRateLimit(socket.id, 'deliver', 2000)) return;
    const p = players[socket.id];
    if (p && p.cargo && p.cargo.length > 0) {
      let onPad = false;
      for (const pt of DELIVERY_POINTS) {
          const padX = pt.x + 250 * Math.sin(pt.rot);
          const padZ = pt.z + 250 * Math.cos(pt.rot);
          if (Math.abs(p.position[0] - padX) < 300 && Math.abs(p.position[2] - padZ) < 300) {
              onPad = true; break;
          }
      }

      if (!onPad && p.nickname !== 'Admin') return; 

      const multiplier = p.isPremium ? 30 : 15;
      const cargoCount = p.cargo.length;
      p.points += multiplier * cargoCount;
      const normalizedNick = p.nickname?.toLowerCase();
      if (normalizedNick) updateUserPoints(normalizedNick, p.points);
      
      p.cargo = getRandomCargo();
      p.position = [(Math.random() - 0.5) * 40, 0, 200];
      p.rotation = [0, 0, 0];
      p.ignoreNextMove = true; // Разрешаем синхронизацию после прыжка
      
      updatePlayerGrid(socket, p.position);
      const rooms = getNearbyCells(p.cell);
      io.to(rooms).emit('playerUpdated', p);
      socket.emit('authoritativeRespawn', { position: p.position, cargo: p.cargo });
    }
  });



  socket.on('requestPremium', () => {
    const p = players[socket.id];
    if (p && p.nickname) {
        const req = {
            requestId: Date.now() + Math.random(),
            nickname: p.nickname,
            price: 2500,
            createdAt: Date.now()
        };
        pendingPremiumRequests.push(req);
        io.emit('pendingPremiumState', pendingPremiumRequests);
    }
  });

  socket.on('adminApprovePremium', (requestId) => {
    if (players[socket.id]?.nickname?.toLowerCase() !== 'admin') return;
    const idx = pendingPremiumRequests.findIndex(r => r.requestId === requestId);
    if (idx !== -1) {
      const req = pendingPremiumRequests[idx];
      const p = Object.values(players).find(pl => pl.nickname === req.nickname);
      const normalizedNick = req.nickname.toLowerCase();
      
      updateUserPremium(normalizedNick, true);
      if (p) {
          p.isPremium = true;
          const rooms = getNearbyCells(p.cell);
          io.to(rooms).emit('playerUpdated', p);
      }
      pendingPremiumRequests.splice(idx, 1);
      io.emit('pendingPremiumState', pendingPremiumRequests);
    }
  });

  socket.on('adminRejectPremium', (requestId) => {
    if (players[socket.id]?.nickname?.toLowerCase() !== 'admin') return;
    pendingPremiumRequests = pendingPremiumRequests.filter(r => r.requestId !== requestId);
    io.emit('pendingPremiumState', pendingPremiumRequests);
  });

  socket.on('updateBillboard', (data) => {
    if (!checkRateLimit(socket.id, 'rent', 5000)) return;
    
    // SERVER-SIDE ANTI-SPAM: Check if already rented
    const bb = billboards.find(b => Number(b.id) === Number(data.id));
    if (bb && bb.expiresAt && Date.now() < bb.expiresAt) {
        socket.emit('gameNotification', { message: '⛔ This billboard is already rented!', type: 'error' });
        return;
    }
    const cleanText = (data.text || "").trim().replace(/[^a-zA-Z0-9_А-яЁё .!\-]/g, '');
    const req = { 
        requestId: Date.now() + Math.random(), 
        bbId: data.id, 
        text: cleanText, 
        color: (data.color || "#eab308"), 
        days: data.days || 7, 
        price: data.price || 0, 
        requesterNick: players[socket.id]?.nickname || 'Anon' 
    };
    pendingRequests.push(req); io.emit('pendingState', pendingRequests);
  });

  socket.on('adminApprove', (requestId) => {
    if (players[socket.id]?.nickname?.toLowerCase() !== 'admin') return;
    const idx = pendingRequests.findIndex(r => r.requestId === requestId);
    if (idx !== -1) {
      const req = pendingRequests[idx];
      const bbIdx = billboards.findIndex(b => Number(b.id) === Number(req.bbId));
      if (bbIdx !== -1) {
        const updated = { ...billboards[bbIdx], text: req.text, color: req.color, expiresAt: Date.now() + req.days * 86400000 };
        billboards[bbIdx] = updated;
        updateBillboardInDB(updated);
        io.emit('billboardUpdate', updated);
      }
      pendingRequests.splice(idx, 1); io.emit('pendingState', pendingRequests);
    }
  });

  socket.on('adminReject', (requestId) => {
    if (players[socket.id]?.nickname?.toLowerCase() !== 'admin') return;
    pendingRequests = pendingRequests.filter(r => r.requestId !== requestId);
    io.emit('pendingState', pendingRequests);
  });

  socket.on('disconnect', () => { 
      broadcastToNearby(socket, 'playerLeft', socket.id);
      const p = players[socket.id];
      if (p && p.cell && grid[p.cell]) {
          grid[p.cell].delete(socket.id);
      }
      delete players[socket.id]; 
      delete rateLimits[socket.id]; // Хакер больше не сможет вешать сервер утечкой памяти
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`[SERVER] Running on port ${PORT}`);
    console.log(`[SERVER] Database: ${DB_PATH}`);
    console.log(`[SERVER] Node Environment: ${process.env.NODE_ENV || 'development'}`);
});

