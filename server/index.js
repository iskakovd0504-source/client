require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const crypto = require('crypto');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

const players = {};
let droppedCargos = []; // Array of { id, x, z, type }

const DB_FILE = './database.json';

// Загрузка / Инициализация БД
let globalDB = { billboards: [], users: {} };
try {
  if (fs.existsSync(DB_FILE)) {
      const data = JSON.parse(fs.readFileSync(DB_FILE, 'utf-8'));
      if (Array.isArray(data)) {
          globalDB.billboards = data;
      } else {
          globalDB = data;
      }
      if (!globalDB.users) globalDB.users = {};
      if (!globalDB.billboards) globalDB.billboards = [];

      // МИГРАЦИЯ
      Object.keys(globalDB).forEach(key => {
          if (key !== 'users' && key !== 'billboards' && typeof globalDB[key] === 'object' && globalDB[key].nickname) {
              const legacyUser = globalDB[key];
              const nick = legacyUser.nickname;
              if (!globalDB.users[nick]) {
                  globalDB.users[nick] = {
                      points: legacyUser.points || 0,
                      isPremium: legacyUser.isPremium || false,
                      deviceId: key,
                      hashedSecret: crypto.createHash('sha256').update(key).digest('hex')
                  };
              }
              delete globalDB[key];
          }
      });
  }
} catch (e) {
  console.error("Error loading DB:", e);
}

let billboards = globalDB.billboards;
let pendingRequests = []; 
let pendingPremiumRequests = []; // Новые заявки на GENESIS статус

if (billboards.length < 101) {
    billboards = [];
    const neonColors = ['#eab308', '#14F195', '#ff00ff', '#00ffff', '#ff4500', '#00bbff'];
    const premiumPrice = { 1: 5000, 7: 20000, 30: 50000 };
    const basicPrice = { 1: 1000, 7: 4000, 30: 10000 };

    for (let i = 0; i < 270; i++) {
        let x = (Math.random() - 0.5) * 7800;
        let z = (Math.random() * 4500) - 3800;
        const type = i % 3 === 0 ? (i % 6 === 0 ? 1 : 0) : 2;
        
        billboards.push({
            id: i, x, z, rotY: Math.random() * Math.PI * 2,
            text: `AD SPACE #${i}`, color: neonColors[i % neonColors.length],
            type, expiresAt: null,
            prices: (type === 1 || type === 0) ? premiumPrice : basicPrice
        });
    }
    saveDB();
}

function saveDB() {
    globalDB.billboards = billboards;
    fs.writeFileSync(DB_FILE, JSON.stringify(globalDB, null, 2));
}

const CARGO_TYPES = ['Solana Validator Node', 'Saga Mobile (Batch 2)', 'Dedicated RPC Cluster', 'Genesis Block Snapshot', 'Jito-MEV Accelerator'];

// Bots
for (let i = 1; i <= 4; i++) {
  const botId = 'bot_' + i;
  players[botId] = {
    id: botId, nickname: 'CargoBot ' + i, position: [(Math.random() - 0.5) * 400, 0, 100 - i * 150],
    rotation: [0, 0, 0], points: 15 * i, cargo: [CARGO_TYPES[Math.floor(Math.random() * CARGO_TYPES.length)]]
  };
}

setInterval(() => {
  for (let i = 1; i <= 4; i++) {
    const bot = players['bot_' + i];
    if (!bot) continue;
    if (bot.cargo && bot.cargo.length > 0) {
      bot.position[2] -= 0.55; 
      bot.position[0] += Math.sin(Date.now() / (1000 + i*512)) * 0.4;
      bot.rotation[1] = Math.PI + Math.sin(Date.now() / (1000 + i*512)) * 0.1;
      io.emit('playerMoved', bot);
      if (bot.position[2] < -3200) {
        bot.position[2] = 200; bot.position[0] = (Math.random() - 0.5) * 400;
        bot.cargo = [CARGO_TYPES[Math.floor(Math.random() * CARGO_TYPES.length)]];
        bot.points += 15;
        io.emit('playersUpdate', players);
      }
    } else if (Math.random() < 0.05) {
         bot.position[2] = 250; bot.position[0] = (Math.random() - 0.5) * 400;
         bot.cargo = [CARGO_TYPES[Math.floor(Math.random() * CARGO_TYPES.length)]];
         io.emit('playersUpdate', players);
    }
  }
}, 50);

const checkExpirations = () => {
    const now = Date.now();
    let changed = false;
    billboards.forEach(b => {
        if (b.expiresAt && now > b.expiresAt) {
            b.text = `AD SPACE #${b.id}`; b.expiresAt = null;
            const neonColors = ['#eab308', '#14F195', '#ff00ff', '#00ffff', '#ff4500'];
            b.color = neonColors[b.id % neonColors.length];
            changed = true;
        }
    });
    if (changed) { saveDB(); io.emit('billboardState', billboards); }
};
setInterval(checkExpirations, 60000);

const ADMIN_KEY = process.env.ADMIN_KEY;

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);
  players[socket.id] = { id: socket.id, nickname: 'Anon', position: [0, 0, 200], rotation: [0, 0, 0], points: 0, cargo: null, isPremium: false };

  socket.on('join', (data) => {
    const finalNickname = data.nickname;
    const normalizedNick = finalNickname.toLowerCase();
    const deviceId = data.deviceId;
    const secretInput = data.password || data.deviceId;
    const hashedSecret = crypto.createHash('sha256').update(secretInput).digest('hex');

    if (finalNickname === 'Admin' && data.password !== ADMIN_KEY) {
        socket.emit('gameNotification', { message: '⛔ Invalid Admin Key!', type: 'error' });
        return;
    }

    const existingUser = globalDB.users[normalizedNick];
    if (existingUser) {
        if (existingUser.hashedSecret !== hashedSecret && existingUser.deviceId !== deviceId) {
            socket.emit('authRequired', { nickname: finalNickname });
            return;
        }
        // Загружаем только если в памяти НЕТ очков или в базе их больше
        if (players[socket.id].points < (existingUser.points || 0)) {
            players[socket.id].points = existingUser.points || 0;
        }
        players[socket.id].isPremium = existingUser.isPremium || false;
    } else {
        globalDB.users[normalizedNick] = { hashedSecret, deviceId, points: 0, isPremium: false };
        saveDB();
        socket.emit('registrationSuccess', { accessId: deviceId });
    }

    players[socket.id].nickname = finalNickname;
    players[socket.id].cargo = data.cargo;
    players[socket.id].deviceId = deviceId;

    io.emit('playersUpdate', players);
    socket.emit('cargoState', droppedCargos);
    socket.emit('billboardState', billboards);
    if (finalNickname === 'Admin') {
        socket.emit('pendingState', pendingRequests);
        socket.emit('pendingPremiumState', pendingPremiumRequests);
    }
  });

  socket.on('restockCargo', (data) => {
    const p = players[socket.id];
    if (p) { p.cargo = data.cargo; io.emit('playersUpdate', players); }
  });

  socket.on('move', (data) => {
    if (players[socket.id]) {
      players[socket.id].position = data.position;
      players[socket.id].rotation = data.rotation;
      socket.broadcast.emit('playerMoved', players[socket.id]);
    }
  });

  socket.on('hit', (targetId) => {
    const target = players[targetId];
    if (target && target.nickname === 'Admin') return;
    if (target && target.cargo && target.cargo.length > 0) {
      const droppedItem = target.cargo.pop();
      const drop = { id: Date.now() + Math.random(), x: target.position[0], z: target.position[2], type: droppedItem };
      droppedCargos.push(drop);
      io.emit('cargoDropped', drop);
      io.emit('playersUpdate', players);
    }
  });

  socket.on('pickup', (cargoId) => {
    const idx = droppedCargos.findIndex(c => c.id === cargoId);
    if (idx !== -1) {
      const cargo = droppedCargos[idx];
      if (!players[socket.id].cargo) players[socket.id].cargo = [];
      players[socket.id].cargo.push(cargo.type);
      droppedCargos.splice(idx, 1);
      io.emit('cargoPicked', cargoId);
      io.emit('playersUpdate', players);
    }
  });

  socket.on('deliver', () => {
    const p = players[socket.id];
    if (p && p.cargo && p.cargo.length > 0) {
      const multiplier = p.isPremium ? 30 : 15;
      const cargoCount = p.cargo.length;
      p.points += multiplier * cargoCount;
      const normalizedNick = p.nickname?.toLowerCase();
      if (normalizedNick && globalDB.users[normalizedNick]) {
          if (globalDB.users[normalizedNick].points < p.points) {
              globalDB.users[normalizedNick].points = p.points;
              saveDB();
          }
      }
      p.cargo = [];
      io.emit('playersUpdate', players);
      console.log(`[DELIVERY] ${p.nickname} +${multiplier * cargoCount}. Total: ${p.points}`);
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
    if (players[socket.id]?.nickname !== 'Admin') return;
    const idx = pendingPremiumRequests.findIndex(r => r.requestId === requestId);
    if (idx !== -1) {
      const req = pendingPremiumRequests[idx];
      const p = Object.values(players).find(pl => pl.nickname === req.nickname);
      const normalizedNick = req.nickname.toLowerCase();
      
      if (globalDB.users[normalizedNick]) {
          globalDB.users[normalizedNick].isPremium = true;
          saveDB();
          if (p) {
              p.isPremium = true;
              io.emit('playersUpdate', players);
          }
      }
      pendingPremiumRequests.splice(idx, 1);
      io.emit('pendingPremiumState', pendingPremiumRequests);
    }
  });

  socket.on('adminRejectPremium', (requestId) => {
    if (players[socket.id]?.nickname !== 'Admin') return;
    pendingPremiumRequests = pendingPremiumRequests.filter(r => r.requestId !== requestId);
    io.emit('pendingPremiumState', pendingPremiumRequests);
  });

  socket.on('updateBillboard', (data) => {
    const req = { requestId: Date.now() + Math.random(), bbId: data.id, text: data.text, color: data.color, days: data.days || 7, price: data.price || 0, requesterNick: players[socket.id]?.nickname || 'Anon' };
    pendingRequests.push(req); io.emit('pendingState', pendingRequests);
  });

  socket.on('adminApprove', (requestId) => {
    if (players[socket.id]?.nickname !== 'Admin') return;
    const idx = pendingRequests.findIndex(r => r.requestId === requestId);
    if (idx !== -1) {
      const req = pendingRequests[idx];
      const bb = billboards.find(b => Number(b.id) === Number(req.bbId));
      if (bb) {
        bb.text = req.text; bb.color = req.color;
        bb.expiresAt = Date.now() + req.days * 86400000;
        saveDB(); io.emit('billboardUpdate', bb);
      }
      pendingRequests.splice(idx, 1); io.emit('pendingState', pendingRequests);
    }
  });

  socket.on('adminReject', (requestId) => {
    if (players[socket.id]?.nickname !== 'Admin') return;
    pendingRequests = pendingRequests.filter(r => r.requestId !== requestId);
    io.emit('pendingState', pendingRequests);
  });

  socket.on('disconnect', () => { delete players[socket.id]; io.emit('playersUpdate', players); });
});

const PORT = 3001;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
