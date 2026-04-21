require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

const fs = require('fs');
const players = {};
let droppedCargos = []; // Array of { id, x, z, type }

const DB_FILE = './database.json';
let globalDB = {};
let billboards = []; // Array of { id, text, color, rotY, x, z }
let pendingRequests = []; // Очередь модерации всегда пуста при старте

// Инициализация базы данных (persistence)
if (fs.existsSync(DB_FILE)) {
  try {
     globalDB = JSON.parse(fs.readFileSync(DB_FILE, 'utf-8'));
     if (globalDB.billboards) billboards = globalDB.billboards;
  } catch(e) {}
}

// Если билбордов еще нет в базе, инициализируем 270 слотов
if (billboards.length === 0) {
    const neonColors = ['#eab308', '#14F195', '#ff00ff', '#00ffff', '#ff4500'];
    
    for (let i = 0; i < 270; i++) {
        let x, z;
        if (i === 0) {
            x = 40;
            z = 150;
        } else {
            x = (Math.random() - 0.5) * 9000;
            z = (Math.random() - 0.9) * 6500;
        }

        const type = i % 3;
        // Предварительно прописываем цены для каждого срока
        const prices = {
            1: type === 1 ? 2000 : (type === 2 ? 500 : 1000),
            7: type === 1 ? 10000 : (type === 2 ? 2500 : 5000),
            30: type === 1 ? 30000 : (type === 2 ? 7000 : 15000)
        };
        
        billboards.push({
            id: i,
            x,
            z,
            rotY: Math.random() * Math.PI * 2,
            text: `AD SPACE #${i}`,
            color: neonColors[i % neonColors.length],
            type,
            prices, // Цены теперь ТУТ
            expiresAt: null
        });
    }
}

const saveDB = () => {
    globalDB.billboards = billboards;
    fs.writeFileSync(DB_FILE, JSON.stringify(globalDB));
};

const CARGO_TYPES = [
  '10x ASIC Antminer S19',
  'Golden Trezor T',
  '1000 BTC Hardware Node',
  'Satoshi Nakamoto Statue',
  'Pallet of RTX 5090s'
];

// Initialize 4 autopilot bots
for (let i = 1; i <= 4; i++) {
  const botId = 'bot_' + i;
  players[botId] = {
    id: botId,
    nickname: 'CargoBot ' + i,
    position: [(Math.random() - 0.5) * 400, 0, 100 - i * 150],
    rotation: [0, 0, 0],
    points: 15 * i, // Some starting score
    cargo: [CARGO_TYPES[Math.floor(Math.random() * CARGO_TYPES.length)]]
  };
}

// Bot physics/movement loop @ 20 FPS
setInterval(() => {
  for (let i = 1; i <= 4; i++) {
    const bot = players['bot_' + i];
    if (!bot) continue;
    
    if (bot.cargo && bot.cargo.length > 0) {
      // Move bots linearly towards Alatau City (-3500 Z)
      bot.position[2] -= 0.55; 
      // Add wiggle steering so they don't look completely stale
      bot.position[0] += Math.sin(Date.now() / (1000 + i*512)) * 0.4;
      // Rotate them dynamically
      const targetYaw = Math.PI; // Face backward (-Z)
      bot.rotation[1] = targetYaw + Math.sin(Date.now() / (1000 + i*512)) * 0.1;
      
      io.emit('playerMoved', bot);
      
      if (bot.position[2] < -3200) {
        // Delivered! Reset to Baikonur
        bot.position[2] = 200;
        bot.position[0] = (Math.random() - 0.5) * 400;
        bot.cargo = [CARGO_TYPES[Math.floor(Math.random() * CARGO_TYPES.length)]];
        bot.points += 15;
        io.emit('playersUpdate', players);
      }
    } else {
      // Bot was killed/hit. It lost its cargo via the standard socket 'hit' event.
      // Wait a moment then respawn and restock them at start
      if (Math.random() < 0.05) { // Slow randomized respawn
         bot.position[2] = 250; 
         bot.position[0] = (Math.random() - 0.5) * 400;
         bot.cargo = [CARGO_TYPES[Math.floor(Math.random() * CARGO_TYPES.length)]];
         io.emit('playersUpdate', players);
      }
    }
  }
}, 50);

const checkExpirations = () => {
    const now = Date.now();
    let changed = false;
    billboards.forEach(b => {
        if (b.expiresAt && now > b.expiresAt) {
            console.log(`[ECONOMY] Billboard #${b.id} expired. Resetting.`);
            b.text = `AD SPACE #${b.id}`;
            b.expiresAt = null;
            const neonColors = ['#eab308', '#14F195', '#ff00ff', '#00ffff', '#ff4500'];
            b.color = neonColors[b.id % neonColors.length];
            changed = true;
        }
    });
    if (changed) {
        saveDB();
        // Раньше слали всё: io.emit('billboardState', billboards);
        // Теперь шлем только измененные (в данном случае проще переслать те, что обновились)
        billboards.forEach(b => {
             if (b.expiresAt === null && b.text.startsWith('AD SPACE #')) {
                 // Это упрощенный хак для рассылки только "сброшенных"
                 io.emit('billboardUpdate', b);
             }
        });
    }
};
setInterval(checkExpirations, 60000); // Проверка раз в минуту

const ADMIN_KEY = process.env.ADMIN_KEY; // Всегда берется ТОЛЬКО из .env

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  players[socket.id] = {
    id: socket.id,
    nickname: 'Anon',
    position: [0, 0, 200],
    rotation: [0, 0, 0],
    points: 0,
    cargo: null,
    isPremium: false
  };

  socket.on('join', (data) => {
    let finalNickname = data.nickname;
    
    // Проверка прав админа
    if (data.nickname === 'Admin') {
       if (data.password !== ADMIN_KEY) {
          console.warn(`[SECURITY] Unauthorized Admin login attempt from ${socket.id}`);
          finalNickname = 'Runner-' + Math.floor(Math.random()*1000);
       } else {
          console.log(`[SECURITY] Admin access granted to ${socket.id}`);
       }
    }

    players[socket.id].nickname = finalNickname;
    players[socket.id].cargo = data.cargo;
    players[socket.id].deviceId = data.deviceId;

    // ПРЕДОТВРАЩЕНИЕ РАЗДВОЕНИЯ: Если игрок с таким же deviceId уже есть, удаляем старую сессию
    if (data.deviceId) {
       Object.keys(players).forEach(pid => {
           if (pid !== socket.id && players[pid].deviceId === data.deviceId) {
               console.log(`[CLEANUP] Removing ghost player ${pid} for device ${data.deviceId}`);
               delete players[pid];
           }
       });

       if (globalDB[data.deviceId]) {
           players[socket.id].points = globalDB[data.deviceId].points;
           players[socket.id].isPremium = globalDB[data.deviceId].isPremium || false;
       } else {
           globalDB[data.deviceId] = { points: 0, nickname: data.nickname, isPremium: false };
       }
    }

    io.emit('playersUpdate', players);
    socket.emit('cargoState', droppedCargos);
    socket.emit('billboardState', billboards);
    console.log(`[DEBUG] Sent ${billboards.length} billboards to player ${socket.id}`);
    
    if (finalNickname === 'Admin') {
        socket.emit('pendingState', pendingRequests);
    } else if (data.nickname === 'Admin') {
        // Если пытался зайти как админ, но не прошел проверку
        socket.emit('gameNotification', { message: '⛔ Invalid Admin Key!', type: 'error' });
    }
  });

  socket.on('move', (data) => {
    if (players[socket.id]) {
      players[socket.id].position = data.position;
      players[socket.id].rotation = data.rotation;
      // We only broadcast movement to others to save bandwidth
      socket.broadcast.emit('playerMoved', players[socket.id]);
    }
  });

  socket.on('hit', (targetId) => {
    const target = players[targetId];
    if (target && target.cargo && target.cargo.length > 0) {
      console.log(`Player ${socket.id} hit ${targetId}, dropping cargo!`);
      const droppedItem = target.cargo.pop(); // Выбиваем 1 груз из стопки!
      const drop = {
        id: Date.now().toString() + Math.random().toString(),
        x: target.position[0],
        z: target.position[2],
        type: droppedItem
      };
      droppedCargos.push(drop);
      
      io.emit('cargoDropped', drop);
      io.emit('playersUpdate', players); // sync new cargo states
    }
  });

  socket.on('pickup', (cargoId) => {
    const idx = droppedCargos.findIndex(c => c.id === cargoId);
    if (idx !== -1) {
      const cargo = droppedCargos[idx];
      if (!players[socket.id].cargo || !Array.isArray(players[socket.id].cargo)) {
         players[socket.id].cargo = [];
      }
      players[socket.id].cargo.push(cargo.type);
      droppedCargos.splice(idx, 1);
      console.log(`Player ${socket.id} picked up ${cargo.type}`);
      
      io.emit('cargoPicked', cargoId);
      io.emit('playersUpdate', players);
    }
  });

  socket.on('deliver', () => {
    const p = players[socket.id];
    if (p && p.cargo && p.cargo.length > 0) {
      const multiplier = p.isPremium ? 30 : 15; // Даем х2 за премиум
      p.points += multiplier * p.cargo.length;
      p.cargo = [];
      
      // Персистентное сохранение заработанного баланса на диск
      if (p.deviceId) {
          globalDB[p.deviceId] = { 
              points: p.points, 
              nickname: p.nickname,
              isPremium: p.isPremium 
          };
          saveDB();
      }

      io.emit('playersUpdate', players);
    }
  });

  // Логика покупки премиума: Игрок успешно совершил транзакцию SOL в браузере
  socket.on('upgradePremium', (signature) => {
    const p = players[socket.id];
    if (p && p.deviceId) {
      console.log(`Player ${p.deviceId} upgraded to premium! Tx: ${signature}`);
      p.isPremium = true;
      globalDB[p.deviceId].isPremium = true;
      saveDB();
      io.emit('playersUpdate', players); // Рассылаем всем новый статус!
    }
  });

  socket.on('updateBillboard', (data) => {
    const request = {
       requestId: Date.now() + Math.random(),
       bbId: data.id,
       text: data.text,
       color: data.color,
       days: data.days || 7,
       price: data.price || 0,
       requesterNick: players[socket.id]?.nickname || 'Anon',
       createdAt: Date.now()
    };
    console.log(`[ECONOMY] New request for BB #${request.bbId} for ${request.days} days`);
    pendingRequests.push(request);
    io.emit('pendingState', pendingRequests);
  });

  socket.on('adminApprove', (requestId) => {
    if (players[socket.id]?.nickname !== 'Admin') return; // SECURITY

    const idx = pendingRequests.findIndex(r => r.requestId === requestId);
    if (idx !== -1) {
      const req = pendingRequests[idx];
      const bb = billboards.find(b => Number(b.id) === Number(req.bbId));
      if (bb) {
        bb.text = req.text;
        bb.color = req.color;
        const durationMs = req.days * 24 * 60 * 60 * 1000;
        bb.expiresAt = Date.now() + durationMs;
        saveDB();
        io.emit('billboardUpdate', bb);
        console.log(`[ECONOMY] Approved BB #${req.bbId} for ${req.days} days`);
      }
      pendingRequests.splice(idx, 1);
      io.emit('pendingState', pendingRequests);
    }
  });

  socket.on('adminReject', (requestId) => {
    if (players[socket.id]?.nickname !== 'Admin') return; // SECURITY

    pendingRequests = pendingRequests.filter(r => r.requestId !== requestId);
    io.emit('pendingState', pendingRequests);
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
    delete players[socket.id];
    io.emit('playersUpdate', players);
  });
});

const PORT = 3001;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
