import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Sky, Plane, Box, Text } from '@react-three/drei';
import { io } from 'socket.io-client';
import * as THREE from 'three';
import { KASPI_QR_BASE64 } from './KaspiQR';

const socket = io('http://localhost:3001');

const CARGO_TYPES = [
  'Solana Validator Node',
  'Saga Mobile (Batch 2)',
  'Dedicated RPC Cluster',
  'Genesis Block Snapshot',
  'Jito-MEV Accelerator'
];

const MAP_LIMIT = 4000;
const ALATAU_Z = -3500;

const DELIVERY_POINTS = [
  // FRONT (Top of map)
  { id: 'f1', x: 0, z: ALATAU_Z, rot: 0, label: "CENTRAL FRONT HUB" },
  { id: 'f2', x: -2000, z: ALATAU_Z, rot: 0, label: "WEST FRONT HUB" },
  { id: 'f3', x: 2000, z: ALATAU_Z, rot: 0, label: "EAST FRONT HUB" },
  // LEFT SIDE
  { id: 'l1', x: -3800, z: -2500, rot: Math.PI / 2, label: "WEST COAST ALPHA" },
  { id: 'l2', x: -3800, z: -1000, rot: Math.PI / 2, label: "WEST COAST BETA" },
  { id: 'l3', x: -3800, z: 500, rot: Math.PI / 2, label: "WEST COAST GAMMA" },
  // RIGHT SIDE
  { id: 'r1', x: 3800, z: -2500, rot: -Math.PI / 2, label: "EAST COAST ALPHA" },
  { id: 'r2', x: 3800, z: -1000, rot: -Math.PI / 2, label: "EAST COAST BETA" },
  { id: 'r3', x: 3800, z: 500, rot: -Math.PI / 2, label: "EAST COAST GAMMA" },
];

const LEVEL_OBSTACLES = []; // Пустошь теперь пуста
const MOCK_ADS = [
  { text: 'AIPROTOCOL.KZ', color: '#00ffff' },
  { text: 'BUY $SOL', color: '#14F195' },
  { text: 'BINANCE KZ', color: '#FCD535' },
  { text: 'ASTANA HUB', color: '#ff00ff' },
  { text: 'TON FOUNDATION', color: '#0088cc' },
  { text: 'YOUR AD\nHERE', color: '#eab308' },
  { text: 'LONG $CMKZ', color: '#ff4444' }
];

// LEVEL_BILLBOARDS is now managed by the server for sync
let LEVEL_BILLBOARDS = []; 


const VoxelCar = ({ position, rotation, isPremium, isAdmin }) => {
  const mainColor = isAdmin ? '#111111' : (isPremium ? '#eab308' : '#ffffff');
  const detailColor = isAdmin ? '#00ffff' : (isPremium ? '#000000' : '#444444');
  const windowColor = isAdmin ? '#00ffff' : '#88ccff';
  
  return (
    <group position={position} rotation={rotation}>
      <Box args={[2.2, 1, 4.5]} position={[0, 0.8, 0]} castShadow>
        <meshStandardMaterial color={mainColor} emissive={isAdmin ? '#00ffff' : '#000'} emissiveIntensity={isAdmin ? 0.2 : 0} />
      </Box>
      <Box args={[1.8, 0.9, 2]} position={[0, 1.7, -0.5]} castShadow>
        <meshStandardMaterial color={windowColor} transparent={isAdmin} opacity={isAdmin ? 0.8 : 1} />
      </Box>
      <Box args={[2.5, 0.8, 0.8]} position={[0, 0.4, -1.3]} castShadow>
        <meshStandardMaterial color={detailColor} />
      </Box>
      <Box args={[2.5, 0.8, 0.8]} position={[0, 0.4, 1.3]} castShadow>
        <meshStandardMaterial color={detailColor} />
      </Box>
      <Box args={[1.8, 0.2, 0.2]} position={[0, 1.0, -2.3]}>
        <meshBasicMaterial color={isAdmin ? "#00ffff" : "#ffffcc"} />
      </Box>
      <Box args={[1.8, 0.2, 0.2]} position={[0, 1.0, 2.3]}>
        <meshBasicMaterial color={isAdmin ? "#ff00ff" : "#ff0000"} />
      </Box>
    </group>
  );
};

const PlayerController = ({ players, droppedCargos, myPlayerState, billboards, adminKey }) => {
  const { camera } = useThree();
  const ref = useRef({
    position: new THREE.Vector3(0, 0, 200),
    velocity: 0,
    targetVelocity: 0,
    yaw: 0,
    targetYaw: 0,
    isRestocking: false,
  });
  const carMeshRef = useRef();

  const [keys, setKeys] = useState({});
  const lasersRef = useRef([]);
  const [laserCounter, setLaserCounter] = useState(0);

  useEffect(() => {
    const handleShoot = () => {
      const { position, yaw } = ref.current;
      const quat = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw, 0, 'YXZ'));
      const direction = new THREE.Vector3(0, 0, -1).applyQuaternion(quat);
      
      const newLaser = {
        id: Date.now() + Math.random(),
        position: position.clone().add(new THREE.Vector3(0, 1.5, 0)).add(direction.clone().multiplyScalar(5)),
        velocity: direction.multiplyScalar(2500), 
        yaw: yaw, 
        life: 30,
        meshRef: React.createRef()
      };
      lasersRef.current.push(newLaser);
      setLaserCounter(c => c + 1);
    };

    const handleKeyDown = (e) => {
      setKeys((k) => ({ ...k, [e.code]: true }));
      if (e.code === 'Space') handleShoot();
    };
    const handleKeyUp = (e) => setKeys((k) => ({ ...k, [e.code]: false }));
    const handleMouseShoot = (e) => { if (e.button === 0) handleShoot(); };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('mousedown', handleMouseShoot);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('mousedown', handleMouseShoot);
    };
  }, []);

  useFrame((state, delta) => {
    const r = ref.current;
    const isLocalAdmin = myPlayerState?.nickname === 'Admin';
    const m = isLocalAdmin ? 4 : 1;

    if (keys['KeyW']) r.targetVelocity += 0.0125 * m; 
    if (keys['KeyS']) r.targetVelocity -= 0.025 * m; 
    if (!keys['KeyW'] && !keys['KeyS']) r.targetVelocity *= 0.96; 
    if (keys['Space']) r.targetVelocity *= 0.98;

    r.targetVelocity = Math.max(-0.2 * m, Math.min(0.55 * m, r.targetVelocity));
    r.velocity += (r.targetVelocity - r.velocity) * 0.1; 

    const isMovingForward = r.velocity > 0.01;
    const isMoving = Math.abs(r.velocity) > 0.01;
    
    if (isMoving) {
       const turnRate = 0.05 * (Math.abs(r.velocity) / 0.375); 
       const clampedTurnRate = Math.min(Math.max(turnRate, 0.02), 0.06); 
       if (keys['ArrowLeft'] || keys['KeyA']) r.targetYaw += isMovingForward ? clampedTurnRate : -clampedTurnRate;
       if (keys['ArrowRight'] || keys['KeyD']) r.targetYaw -= isMovingForward ? clampedTurnRate : -clampedTurnRate;
    }

    r.yaw += (r.targetYaw - r.yaw) * 0.3;
    const quat = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, r.yaw, 0, 'YXZ'));
    const direction = new THREE.Vector3(0, 0, -1).applyQuaternion(quat);
    const moveStep = r.velocity * (delta * 60);
    const nextPos = r.position.clone().add(direction.clone().multiplyScalar(moveStep));

    let collision = false;
    for (const pt of DELIVERY_POINTS) {
        if (Math.abs(nextPos.x - pt.x) > 400 || Math.abs(nextPos.z - pt.z) > 400) continue;
        const isRotated = Math.abs(pt.rot) > 0.1;
        const hw = isRotated ? 100 : 200;
        const hd = isRotated ? 200 : 100;
        if (Math.abs(nextPos.x - pt.x) < (hw + 5) && Math.abs(nextPos.z - pt.z) < (hd + 5)) {
            collision = true;
            break;
        }
    }

    if (collision) {
        r.velocity = 0;
        r.targetVelocity = 0;
        r.position.sub(direction.multiplyScalar(0.5));
    } else {
        r.position.copy(nextPos);
    }

    r.position.y = 0; 
    if (r.position.x > MAP_LIMIT - 10) r.position.x = MAP_LIMIT - 10;
    if (r.position.x < -MAP_LIMIT + 10) r.position.x = -MAP_LIMIT + 10;
    if (r.position.z < -MAP_LIMIT + 10) r.position.z = -MAP_LIMIT + 10;
    
    if (players && players[socket.id]) {
      players[socket.id].position = [r.position.x, r.position.y, r.position.z];
      players[socket.id].rotation = [0, r.yaw, 0];
    }

    const cameraOffset = new THREE.Vector3(0, 4, 15).applyQuaternion(quat);
    const targetCameraPos = r.position.clone().add(cameraOffset);
    state.camera.position.lerp(targetCameraPos, 10 * delta); 

    const lookTarget = r.position.clone().add(new THREE.Vector3(0, 2, 0)).add(direction.clone().multiplyScalar(40));
    state.camera.lookAt(lookTarget);

    if (Date.now() % 200 < 20) {
      socket.emit('move', {
        position: [r.position.x, r.position.y, r.position.z],
        rotation: [0, r.yaw, 0]
      });
    }

    const activeLasers = [];
    for (const l of lasersRef.current) {
         let hitInfo = false;
         // Лазеры больше не врезаются в билборды
         for (const pid in players) {
            if (pid === socket.id) continue;
            const target = players[pid];
            if (!target.cargo || !target.position) continue; 
            const dist = l.position.distanceTo(new THREE.Vector3(target.position[0], target.position[1], target.position[2]));
            if (dist < 25.0) { 
               if (target.nickname === 'Admin') continue;
               socket.emit('hit', pid); 
               hitInfo = true;
               break;
            }
         }

         if (!hitInfo && l.life > 0) {
            l.position.add(l.velocity.clone().multiplyScalar(delta));
            l.life -= 1;
            if (l.meshRef.current) l.meshRef.current.position.copy(l.position);
            activeLasers.push(l);
         }
    }
    lasersRef.current = activeLasers;

    if (carMeshRef.current) {
       carMeshRef.current.position.copy(r.position);
       carMeshRef.current.rotation.y = r.yaw;
    }

    if (myPlayerState) {
       for (const dc of droppedCargos) {
          if (Math.hypot(r.position.x - dc.x, r.position.z - dc.z) < 6) {
             socket.emit('pickup', dc.id);
          }
       }

       if ((!myPlayerState.cargo || myPlayerState.cargo.length === 0) && r.position.z > 0 && r.position.z < 300) {
            if (!r.isRestocking) {
                r.isRestocking = true; 
                const newCargo = CARGO_TYPES[Math.floor(Math.random() * CARGO_TYPES.length)];
                const deviceId = localStorage.getItem('cmkz_device_id');
                socket.emit('join', { nickname: myPlayerState.nickname, cargo: [newCargo], deviceId, password: adminKey });
                setTimeout(() => { r.isRestocking = false; }, 1000);
            }
       }
    }

    if (myPlayerState && myPlayerState.cargo && myPlayerState.cargo.length > 0) {
        let onDeliveryPad = false;
        for (const pt of DELIVERY_POINTS) {
            const padX = pt.x + 250 * Math.sin(pt.rot);
            const padZ = pt.z + 250 * Math.cos(pt.rot);
            const isRotated = Math.abs(pt.rot) > 0.1;
            const rangeX = isRotated ? 75 : 100;
            const rangeZ = isRotated ? 100 : 75;
            if (Math.abs(r.position.x - padX) < rangeX && Math.abs(r.position.z - padZ) < rangeZ) {
                onDeliveryPad = true;
                break;
            }
        }
       if (onDeliveryPad) {
          socket.emit('deliver');
          r.position.set((Math.random() - 0.5) * 40, 0, 200);
          r.yaw = 0;
          r.velocity = 0;
          r.targetVelocity = 0;

          if (!r.isRestocking) {
              r.isRestocking = true;
              const newCargo = CARGO_TYPES[Math.floor(Math.random() * CARGO_TYPES.length)];
              const deviceId = localStorage.getItem('cmkz_device_id');
              socket.emit('join', { nickname: myPlayerState.nickname, cargo: [newCargo], deviceId, password: adminKey });
              setTimeout(() => { r.isRestocking = false; }, 1000);
          }
       }
    }
  });

  return (
    <>
      <group ref={carMeshRef} position={[0, 0, 200]}>
        <VoxelCar position={[0, 0, 0]} rotation={[0, 0, 0]} isPremium={myPlayerState?.isPremium} isAdmin={myPlayerState?.nickname === 'Admin'} />
      </group>
      {lasersRef.current.map(l => (
        <mesh key={l.id} ref={l.meshRef} position={l.position}>
          <sphereGeometry args={[1.5, 8, 8]} />
          <meshBasicMaterial color="#ffff00" />
        </mesh>
      ))}
    </>
  );
};

const BoundaryFence = () => {
    const lim = MAP_LIMIT;
    // Полупрозрачный голубой силовой барьер, чтобы не перекрывал небо
    const materialArgs = { 
        color: "#00aaff", 
        transparent: true, 
        opacity: 0.1, 
        emissive: "#00ffff", 
        emissiveIntensity: 0.2, 
        depthWrite: false 
    };
    return (
        <group>
            <Box args={[lim*2, 100, 2]} position={[0, 50, -lim]} receiveShadow>
                <meshStandardMaterial {...materialArgs} />
            </Box>
            <Box args={[lim*2, 100, 2]} position={[0, 50, 500]} receiveShadow>
                <meshStandardMaterial {...materialArgs} />
            </Box>
            <Box args={[2, 100, lim + 500]} position={[-lim, 50, (500 - lim)/2]} receiveShadow>
                <meshStandardMaterial {...materialArgs} />
            </Box>
            <Box args={[2, 100, lim + 500]} position={[lim, 50, (500 - lim)/2]} receiveShadow>
                <meshStandardMaterial {...materialArgs} />
            </Box>
        </group>
    );
};

const CargoBox = ({ item }) => {
    const ref = useRef();
    useFrame(() => {
        if(ref.current) ref.current.rotation.y += 0.02;
    });
    return (
        <group ref={ref} position={[item.x, 2, item.z]}>
            <Box args={[3, 3, 3]} castShadow>
                <meshStandardMaterial color="#eab308" emissive="#eab308" emissiveIntensity={0.2} />
            </Box>
            <Text position={[0, 3, 0]} fontSize={2} color="#fff" anchorX="center" anchorY="bottom">
               CARGO DROP
            </Text>
        </group>
    );
};
// ObstacleInstances удален по просьбе пользователя для минимализма

const BillboardItem = ({ b }) => {
    const textRef = useRef();
    const [visible, setVisible] = useState(false);

    useFrame((state) => {
        const dist = state.camera.position.distanceTo(new THREE.Vector3(b.x, 0, b.z));
        const shouldBeVisible = dist < 1000; // Увеличиваем до 1км
        if (visible !== shouldBeVisible) {
            setVisible(shouldBeVisible);
        }
    });

    const isMega = b.type === 1;
    const isLow = b.type === 2;
    
    // Geometry based on type
    const width = isMega ? 120 : (isLow ? 40 : 60);
    const height = isMega ? 60 : (isLow ? 20 : 30);
    const poleHeight = isMega ? 60 : (isLow ? 8 : 40);
    const boardY = poleHeight + height/2;

    return (
        <group position={[b.x, 0, b.z]} rotation={[0, b.rotY, 0]}>
            {/* Poles */}
            {isMega ? (
                <>
                    <Box args={[3, poleHeight, 3]} position={[-width/4, poleHeight/2, 0]} castShadow>
                        <meshStandardMaterial color="#1a1a1a" />
                    </Box>
                    <Box args={[3, poleHeight, 3]} position={[width/4, poleHeight/2, 0]} castShadow>
                        <meshStandardMaterial color="#1a1a1a" />
                    </Box>
                </>
            ) : (
                <Box args={[2, poleHeight, 2]} position={[0, poleHeight/2, 0]} castShadow>
                    <meshStandardMaterial color="#111" />
                </Box>
            )}

            {/* The Board */}
            <Box args={[width, height, 4]} position={[0, boardY, 0]} castShadow>
                <meshStandardMaterial color="#0a0f1e" emissive={b.color} emissiveIntensity={0.12} />
            </Box>

            {/* Double Sided Text (LOD optimized via visible prop) */}
            <group visible={visible}>
                <Text 
                    position={[0, boardY, 2.1]} 
                    fontSize={height/6} 
                    color={b.color} 
                    anchorX="center" 
                    anchorY="middle" 
                    maxWidth={width * 0.9} 
                    textAlign="center" 
                    outlineWidth={0.15} 
                    outlineColor="#000"
                >
                    {b.text}
                </Text>
                <Text 
                    position={[0, boardY, -2.1]} 
                    rotation={[0, Math.PI, 0]}
                    fontSize={height/6} 
                    color={b.color} 
                    anchorX="center" 
                    anchorY="middle" 
                    maxWidth={width * 0.9} 
                    textAlign="center" 
                    outlineWidth={0.15} 
                    outlineColor="#000"
                >
                    {b.text}
                </Text>
            </group>
        </group>
    );
};

const ObstaclesAndBillboards = ({ billboards }) => {
    return (
        <>
            {/* Препятствия удалены */}
            {(billboards || []).map((b) => (
                <BillboardItem key={`bb-${b.id}`} b={b} />
            ))}
        </>
    );
};

const OtherPlayers = ({ players, playersRef }) => {
  const meshRefs = useRef({});

  useFrame((state, delta) => {
    for (const pid in playersRef.current) {
        if (pid === socket.id) continue;
        const p = playersRef.current[pid];
        const group = meshRefs.current[pid];
        if (group && p.position) {
            // Плавная интерполяция других игроков прямо в видеокарте
            group.position.lerp(new THREE.Vector3(p.position[0], p.position[1], p.position[2]), 10 * delta);
            group.rotation.y = p.rotation[1]; 
        }
    }
  });

  return (
    <>
      {Object.values(players).map((p) => {
        if (p.id === socket.id) return null;
        return (
          <group 
            key={p.id} 
            ref={el => meshRefs.current[p.id] = el}
            position={p.position}
          >
            <VoxelCar position={[0,0,0]} rotation={[0,0,0]} isPremium={p.isPremium} isAdmin={p.nickname === 'Admin'} />
            <Text position={[0, 4, 0]} fontSize={2} color={p.nickname === 'Admin' ? "#00ffff" : "white"} anchorX="center" anchorY="middle" fontStyle={p.nickname === 'Admin' ? 'italic' : 'normal'}>
              {p.nickname === 'Admin' ? '⚡ Administrator' : (typeof p.nickname === 'string' ? p.nickname : (p.nickname && p.nickname.nickname ? p.nickname.nickname : 'Pilot'))} {p.cargo && p.cargo.length > 0 ? `📦x${p.cargo.length}` : ''}
            </Text>
          </group>
        );
      })}
    </>
  );
};

const CryptoMarketHQ = ({ position, rotation = 0, label }) => {
  return (
    <group position={position} rotation={[0, rotation, 0]}>
      <Box args={[400, 150, 200]} position={[0, 75, 0]} castShadow receiveShadow>
        <meshStandardMaterial color="#2d3748" />
      </Box>
      <Box args={[405, 5, 205]} position={[0, 140, 0]}>
         <meshBasicMaterial color="#eab308" />
      </Box>
      <Text position={[0, 180, 100]} fontSize={40} color="#003399" anchorX="center" anchorY="bottom" outlineWidth={0.5} outlineColor="#ffffff">
        CRYPTOMARKET.KZ
      </Text>
      <Text position={[0, 50, 101]} fontSize={20} color="#ffffff" anchorX="center" anchorY="middle">
        {label}
      </Text>
      <Box args={[200, 1.5, 150]} position={[0, 0, 250]} receiveShadow>
         <meshStandardMaterial color="#225522" emissive="#00ff00" emissiveIntensity={0.3} />
      </Box>
      <Text position={[0, 2, 250]} rotation={[-Math.PI / 2, 0, 0]} fontSize={20} color="#ffffff">
        DROP CARGO HERE
      </Text>
    </group>
  );
};

const World = ({ billboards, players }) => {
  return (
    <>
      {/* Голубой туман, который плавно растворяет землю в небо на горизонте */}
      <fog attach="fog" args={['#87CEEB', 500, 6000]} />
      {/* Цвет базового фона на случай, если Sky не успел покрыть углы */}
      <color attach="background" args={['#87CEEB']} />

      <ambientLight intensity={0.5} />
      <directionalLight position={[500, 500, 200]} intensity={1.5} castShadow />
      
      <Sky sunPosition={[100, 20, 100]} turbidity={0.5} rayleigh={0.5} />

      <Plane args={[MAP_LIMIT*3, MAP_LIMIT*3]} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
        <meshStandardMaterial color="#3a5833" />
      </Plane>

      <BoundaryFence />

      <group position={[0,0,0]}>
         <Box args={[500, 1, 500]} position={[0, 0, 0]} receiveShadow>
           <meshStandardMaterial color="#888" />
         </Box>
         <Box args={[30, 1.1, 400]} position={[0, 0, 50]} receiveShadow>
           <meshStandardMaterial color="#222" />
         </Box>
         <Text position={[0, 1.1, -100]} rotation={[-Math.PI / 2, 0, 0]} fontSize={40} color="#fff">
           BAIKONUR DEPOT
         </Text>
      </group>

      <ObstaclesAndBillboards billboards={billboards} />

      {/* Massive Alatau Hub Base */}
      <Box args={[MAP_LIMIT * 2, 1, 1000]} position={[0, 0, ALATAU_Z]} receiveShadow>
        <meshStandardMaterial color="#111" />
      </Box>

      {/* 9 CRYPTOMARKET.KZ HQ Buildings */}
      {DELIVERY_POINTS.map(pt => (
          <CryptoMarketHQ 
            key={pt.id} 
            position={[pt.x, 0, pt.z]} 
            rotation={pt.rot} 
            label={pt.label} 
          />
      ))}

      {/* Decorative Cyber Towers */}
      <Box args={[50, 300, 50]} position={[-250, 150, ALATAU_Z - 100]}>
        <meshStandardMaterial color="#1a202c" emissive="#00ffff" emissiveIntensity={0.8} />
      </Box>
      <Box args={[80, 400, 80]} position={[250, 200, ALATAU_Z + 50]}>
        <meshStandardMaterial color="#1a202c" emissive="#ff00ff" emissiveIntensity={0.8} />
      </Box>
      
      <Text position={[0, 1.1, ALATAU_Z + 400]} rotation={[-Math.PI / 2, 0, 0]} fontSize={60} color="#eab308">
        ALATAU CITY
      </Text>
    </>
  );
};

function App() {
  const [nickname, setNickname] = useState('');
  const [inGame, setInGame] = useState(false);
  const [players, setPlayers] = useState({});
  const playersRef = useRef({}); 
  const nicknameRef = useRef(""); // Реф для актуального ника в сокетах
  const adminKeyRef = useRef(""); // Реф для актуального пароля в сокетах
  const [droppedCargos, setDroppedCargos] = useState([]);

  const [billboards, setBillboards] = useState([]);
  const [pendingRequests, setPendingRequests] = useState([]);
  const [adminKey, setAdminKey] = useState(""); // Стейт для пароля админа
  const [nearBb, setNearBb] = useState(null);
  const [rentModal, setRentModal] = useState(false);
  const [adminModal, setAdminModal] = useState(false);
  const [rentText, setRentText] = useState("");
  const [rentColor, setRentColor] = useState("#eab308");
  const [rentDays, setRentDays] = useState(7); // Срок аренды (7 дней по умолчанию)
  const [gameNotification, setGameNotification] = useState(null);
  const [showRegModal, setShowRegModal] = useState(false);
  const [accessIdToSave, setAccessIdToSave] = useState("");
  const [authRequired, setAuthRequired] = useState(false);

  const showNotification = (msg, type = 'info') => {
    setGameNotification({ msg, type });
    setTimeout(() => setGameNotification(null), 4000);
  };

  // Функция getPrice больше не нужна, так как цены приходят с сервера

  useEffect(() => {
    socket.on('playersUpdate', (data) => {
        playersRef.current = data;
        setPlayers(data);
    });
    socket.on('playerMoved', (p) => {
        if (playersRef.current[p.id]) {
            playersRef.current[p.id].position = p.position;
            playersRef.current[p.id].rotation = p.rotation;
        }
    });
    socket.on('cargoState', (data) => setDroppedCargos(data));
    socket.on('cargoDropped', (c) => setDroppedCargos(prev => [...prev, c]));
    socket.on('cargoPicked', (id) => setDroppedCargos(prev => prev.filter(c => c.id !== id)));
    socket.on('billboardState', (data) => {
        console.log('[DEBUG] RECEIVED NEW BILLBOARD STATE:', data.length, 'items');
        setBillboards([...data]); // Force new array for state trigger
    });
    socket.on('billboardUpdate', (updated) => {
        setBillboards(prev => prev.map(b => b.id === updated.id ? updated : b));
    });
    socket.on('pendingState', (data) => {
        console.log('[DEBUG] Received pending requests:', data);
        setPendingRequests(data);
    });
    socket.on('gameNotification', (data) => {
        showNotification(data.message, data.type);
    });
    socket.on('authRequired', () => {
        setAuthRequired(true);
        setInGame(false);
        showNotification('Nickname taken. Enter Access ID.', 'error');
    });
    socket.on('registrationSuccess', (data) => {
        setAccessIdToSave(data.accessId);
        setShowRegModal(true);
    });

    // Авто-реконнект: теперь берем данные из REFS, которые всегда актуальны
    socket.on('connect', () => {
        if (nicknameRef.current) {
            console.log('[SOCKET] Reconnected, re-syncing identity for:', nicknameRef.current);
            const deviceId = localStorage.getItem('cmkz_device_id');
            const activeCargo = playersRef.current[socket.id]?.cargo || [];
            socket.emit('join', { 
                nickname: nicknameRef.current, 
                cargo: activeCargo, 
                deviceId, 
                password: adminKeyRef.current 
            });
        }
    });

    return () => {
      socket.off('playersUpdate');
      socket.off('playerMoved');
      socket.off('cargoState');
      socket.off('cargoDropped');
      socket.off('cargoPicked');
      socket.off('billboardState');
      socket.off('pendingState');
    };
  }, []); // Run ONCE on mount

  useEffect(() => {
    // Проксити чекер для биллбордов (запускается 2 раза в секунду)
    const interval = setInterval(() => {
       const me = playersRef.current[socket.id];
       if (!me) return;
       const myPos = me.position;
       let found = null;
       
       for (const bb of (billboards || [])) {
          const d = Math.hypot(myPos[0] - bb.x, myPos[2] - bb.z);
          if (d < 50) {
             found = bb;
             break;
          }
       }
       setNearBb(found);
    }, 500);

    return () => clearInterval(interval);
  }, [billboards]); // Update interval if billboards change

  const [walletAddress, setWalletAddress] = useState(null);

  const connectPhantom = async () => {
    try {
      if (window.solana && window.solana.isPhantom) {
        const response = await window.solana.connect();
        setWalletAddress(response.publicKey.toString());
      } else {
        alert('Phantom wallet not found! Please install it.');
        window.open('https://phantom.app/', '_blank');
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleJoin = () => {
    if (nickname.trim()) {
      let deviceId = localStorage.getItem('cmkz_device_id');
      if (!deviceId) {
         deviceId = Math.random().toString(36).substring(2, 11).toUpperCase() + '-' + Math.random().toString(36).substring(2, 6).toUpperCase();
         localStorage.setItem('cmkz_device_id', deviceId);
      }

      socket.emit('join', { nickname, deviceId, password: adminKey });
      setInGame(true); 
    }
  };

  const sortedPlayers = Object.values(players).sort((a,b) => b.points - a.points).slice(0, 3);
  const me = players[socket.id];
  const isAdmin = me?.nickname === 'Admin';

  return (
    <>
      {!inGame ? (
        <div className="login-screen interactive">
          {showRegModal && (
            <div className="modal-overlay">
               <div className="rent-modal">
                  <h2>✅ PILOT REGISTERED</h2>
                  <p>For your security, your Access ID is hidden. Copy and save it to login from other devices:</p>
                  <button 
                    className="confirm" 
                    style={{ marginBottom: '10px' }}
                    onClick={() => {
                        navigator.clipboard.writeText(accessIdToSave);
                        showNotification('Access ID copied to clipboard!', 'success');
                    }}
                  >
                    📋 COPY ACCESS ID
                  </button>
                  <button className="cancel" onClick={() => setShowRegModal(false)}>I HAVE SAVED IT</button>
               </div>
            </div>
          )}
          <div className="login-card">
            <div className="status-badge">
              <span className="pulse-dot"></span> 
              NETWORK ACTIVE: {Object.keys(players).length} PILOTS ONLINE
            </div>
            <h1>CRYPTOMARKET.KZ</h1>
            <div className="subtitle">Decentralized Asset Distribution Protocol</div>
            
            <div className="game-rules">
               <div>📦 Secure and distribute Solana Validator Nodes</div>
               <div>🔫 Protect your cargo from rivals</div>
               <div>💰 Exchange loot for $CMKZ at Alatau City</div>
            </div>

            <input 
              type="text" 
              placeholder="Enter Pilot ID..." 
              maxLength={15}
              value={nickname} 
              onChange={e => {
                setNickname(e.target.value);
                nicknameRef.current = e.target.value;
              }}
              onKeyDown={e => e.key === 'Enter' && handleJoin()}
            />
            {(nickname.trim().toLowerCase() === 'admin' || authRequired) && (
              <input 
                type="password" 
                placeholder={authRequired ? "Enter Access ID..." : "Admin Secret Key..."} 
                className="interactive"
                style={{ marginTop: '10px', background: 'rgba(234, 179, 8, 0.1)', border: '1px solid #eab308', borderRadius: '4px', padding: '14px', color: '#fff', width: '100%', outline: 'none' }}
                value={adminKey} 
                onChange={e => {
                    setAdminKey(e.target.value);
                    adminKeyRef.current = e.target.value;
                }}
                onKeyDown={e => e.key === 'Enter' && handleJoin()}
              />
            )}
            <button onClick={handleJoin} style={{ marginTop: '20px' }}>START</button>
          </div>
        </div>
      ) : (
        <div className="ui-layer">
          {nearBb && !rentModal && (
             <div className="ad-prompt interactive" style={{ position: 'absolute', bottom: '250px', right: '20px', zIndex: 100 }}>
                <div className="hud-panel" style={{ textAlign: 'center', border: '2px solid #eab308' }}>
                   <div style={{ fontSize: '10px', color: '#eab308', marginBottom: '5px' }}>AD SPACE FOUND</div>
                   <h4 style={{ margin: '5px 0' }}>SPACE #{nearBb.id}</h4>
                   <button className="interactive" onClick={() => {
                       setRentText(nearBb.text);
                       setRentColor(nearBb.color || "#eab308");
                       setRentDays(7); // Всегда сбрасываем на 7 дней при открытии
                       setRentModal(true);
                   }} style={{ padding: '8px 15px', background: '#eab308', border: 'none', borderRadius: '4px', fontWeight: 'bold', cursor: 'pointer' }}>RENT THIS BOARD</button>
                </div>
             </div>
          )}

          {rentModal && nearBb && (
             <div className="modal-overlay interactive">
                <div className="rent-modal">
                   <h2>RENT BOARD #{nearBb.id}</h2>
                   <div className="rent-modal-content">
                      <p>Show your brand to all runners in this sector.</p>
                      
                      <div className="input-group">
                         <label>Ad Text (Max 15 chars)</label>
                         <input 
                            value={rentText} 
                            onChange={(e) => setRentText(e.target.value)}
                            placeholder="YOUR BRAND" 
                            maxLength={15} 
                         />
                      </div>

                      <div className="input-group">
                         <label>Neon Color</label>
                         <input 
                            type="color" 
                            value={rentColor}
                            onChange={(e) => setRentColor(e.target.value)}
                            style={{ width: '100%', height: '40px', marginBottom: '15px' }} 
                         />
                      </div>

                      <div className="input-group" style={{ background: 'rgba(234, 179, 8, 0.05)', padding: '15px', borderRadius: '10px', border: '1px solid rgba(234, 179, 8, 0.2)', marginBottom: '20px' }}>
                         <label style={{ color: '#eab308', fontWeight: 'bold', marginBottom: '10px', display: 'block' }}>CHOOSE YOUR TARIFF:</label>
                         <div className="duration-selector" style={{ display: 'flex', gap: '10px', marginBottom: '15px' }}>
                            {[1, 7, 30].map(d => {
                               // ПРОБРОС: Сначала берем цену с сервера, если ее нет - из локального конфига
                               const localRates = { 0: {1:1000, 7:5000, 30:15000}, 1: {1:2000, 7:10000, 30:30000}, 2: {1:500, 7:2500, 30:7000} };
                               const p = nearBb.prices?.[d] || localRates[nearBb.type || 0]?.[d] || 0;
                               
                               return (
                                  <button 
                                     key={d} 
                                     onClick={() => setRentDays(d)}
                                     style={{ 
                                        flex: 1, 
                                        padding: '12px 5px', 
                                        fontSize: '11px',
                                        fontWeight: '900',
                                        background: rentDays === d ? '#eab308' : '#1a202c',
                                        color: rentDays === d ? '#000' : '#eab308',
                                        border: rentDays === d ? 'none' : '1px solid #eab308',
                                        borderRadius: '6px',
                                        cursor: 'pointer',
                                        boxShadow: rentDays === d ? '0 0 15px rgba(234, 179, 8, 0.4)' : 'none'
                                     }}
                                  >
                                     <div style={{ opacity: 0.7, fontSize: '9px' }}>{d} DAY{d>1?'S':''}</div>
                                     <div style={{ marginTop: '2px' }}>{p} KZT</div>
                                  </button>
                               );
                            })}
                         </div>
                         <div className="price-info" style={{ textAlign: 'center', fontSize: '18px', fontWeight: 'bold', color: '#14F195' }}>
                            SELECTED: {nearBb.prices?.[rentDays] || ({0:{1:1000,7:5000,30:15000},1:{1:2000,7:10000,30:30000},2:{1:500,7:2500,30:7000}}[nearBb.type||0]?.[rentDays]) || 0} KZT
                         </div>
                      </div>

                      <div className="kaspi-payment">
                         <div className="qr-box">
                            <img src={KASPI_QR_BASE64} alt="Kaspi QR" style={{ width: "150px", height: "auto", display: "block", margin: "0 auto", borderRadius: "8px" }}/>
                         </div>
                         <p>Scan Kaspi QR & Send: <b>{nearBb.prices?.[rentDays] || ({0:{1:1000,7:5000,30:15000},1:{1:2000,7:10000,30:30000},2:{1:500,7:2500,30:7000}}[nearBb.type||0]?.[rentDays]) || 0} KZT</b></p>
                         <p style={{ fontSize: '10px', opacity: 0.7 }}>Message: <b>AD-{nearBb.id}</b></p>
                      </div>

                      <div className="modal-actions">
                         <button className="cancel" onClick={() => setRentModal(false)}>CANCEL</button>
                         <button className="confirm" onClick={() => {
                            if (rentText) {
                               const localRates = { 0: {1:1000, 7:5000, 30:15000}, 1: {1:2000, 7:10000, 30:30000}, 2: {1:500, 7:2500, 30:7000} };
                               const price = nearBb.prices?.[rentDays] || localRates[nearBb.type || 0]?.[rentDays] || 0;
                               console.log(`[ECONOMY] SENDING REQUEST: BB #${nearBb.id}, Term: ${rentDays}, Price: ${price}`);
                               socket.emit('updateBillboard', { 
                                  id: nearBb.id, 
                                  text: rentText, 
                                  color: rentColor,
                                  days: rentDays,
                                  price: price
                               });
                               setRentModal(false);
                               showNotification('Request sent! Verification pending.', 'success');

                            }
                         }}>SUBMIT & PAY</button>
                      </div>
                   </div>
                </div>
             </div>
          )}

          {adminModal && isAdmin && (
             <div className="modal-overlay interactive">
                <div className="admin-modal">
                   <div className="admin-header">
                      <h2>ADMIN PANEL</h2>
                      <button className="close-btn" onClick={() => setAdminModal(false)}>✕</button>
                   </div>
                   
                   <div className="pending-list">
                      <h3>PENDING REQUESTS ({pendingRequests.length})</h3>
                      {pendingRequests.length === 0 ? (
                         <div className="empty-state">No pending requests</div>
                      ) : (
                         pendingRequests.map(req => (
                            <div key={req.requestId} className="pending-item">
                                <div className="req-header" style={{ alignItems: 'center' }}>
                                  <span className="req-nick">User: <b>{req.requesterNick}</b></span>
                                  <span className="req-time" style={{ fontSize: '12px', color: '#eab308', fontWeight: 'bold' }}>
                                     {req.createdAt ? new Date(req.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '??:??'}
                                  </span>
                                  <span className="req-id">AD-{req.bbId}</span>
                                </div>
                                <div className="req-body">
                                   <div className="req-economy-info" style={{ background: 'rgba(255,255,255,0.05)', padding: '10px', borderRadius: '5px', marginBottom: '10px', fontSize: '12px' }}>
                                      <div>TERM: <b style={{ color: '#eab308' }}>{req.days} DAYS</b></div>
                                      <div>EXPECTED: <b style={{ color: '#14F195' }}>{req.price} KZT</b></div>
                                   </div>
                                   <div className="req-compare">
                                      <div className="compare-box">
                                         <span>CURRENT:</span>
                                         <p>{(billboards || []).find(b => Number(b.id) === Number(req.bbId))?.text || "???"}</p>
                                      </div>
                                      <div className="compare-arrow">➜</div>
                                      <div className="compare-box">
                                         <span>PROPOSED:</span>
                                         <p style={{ color: req.color }}>{req.text}</p>
                                      </div>
                                   </div>
                                   <div className="req-text-preview" style={{ 
                                       color: req.color, 
                                       textShadow: `0 0 15px ${req.color}` 
                                   }}>
                                      {req.text}
                                   </div>
                                </div>
                                <div className="req-actions">
                                   <button className="reject" onClick={() => socket.emit('adminReject', req.requestId)}>REJECT</button>
                                   <button className="approve" onClick={() => socket.emit('adminApprove', req.requestId)}>APPROVE</button>
                                </div>
                            </div>
                         ))
                      )}
                   </div>
                </div>
             </div>
          )}

          {isAdmin && (
             <button className="admin-gear-btn interactive" onClick={() => setAdminModal(true)}>
                ⚙️
                {pendingRequests.length > 0 && <span className="notification-badge">{pendingRequests.length}</span>}
             </button>
          )}

          <div className="hud-top-left interactive">
            <div className="hud-panel">
               <button 
                  className="interactive" 
                  style={{ background: 'rgba(234, 179, 8, 0.1)', border: '1px solid #eab308', color: '#eab308', fontSize: '9px', padding: '4px 8px', borderRadius: '4px', cursor: 'pointer', fontWeight: '900' }}
                  onClick={() => {
                      navigator.clipboard.writeText(localStorage.getItem('cmkz_device_id'));
                      showNotification('Access ID copied to clipboard!', 'success');
                  }}
               >
                  📋 COPY ACCESS ID
               </button>
            </div>
            <div className="hud-panel">CARGO: <span>{me?.cargo && me.cargo.length > 0 ? `${me.cargo.length}x CRATES` : 'NONE'}</span></div>
            <div className="hud-panel">BAL: <span>{Math.floor((me?.points || 0) / 15)}</span> $CMKZ</div>
          </div>

          <div className="hud-top-right interactive">
            <div className="leaderboard">
              <div className="leaderboard-title">Top Drivers: {Object.keys(players).length}</div>
              {sortedPlayers.map((p, i) => {
                const displayName = typeof p.nickname === 'string' ? p.nickname : (p.nickname && p.nickname.nickname ? p.nickname.nickname : 'Pilot');
                const cmkz = Math.floor((p.points || 0) / 15);
                return (
                  <div className="leaderboard-item" key={p.id}>
                    <span>{i+1}. {displayName}</span>
                    <span>{cmkz}</span>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="controls-tip">
            <div><kbd>W</kbd> — Gas</div>
            <div><kbd>S</kbd> — Brake / Reverse</div>
            <div><kbd>A</kbd> <kbd>D</kbd> — Steer</div>
            <div><kbd>Space</kbd> / <kbd>LMB</kbd> — Shoot Cargo-Stealer</div>
          </div>

          <div className="premium-card">
            <div className="premium-tag">x2 Farm Boost</div>
            <h3>GENESIS Cybertruck</h3>
            <p>[Cost: 0.25 SOL] Stand out in Alatau City. Double your $CMKZ airdrop pts.</p>
            
            {me?.isPremium ? (
                 <div style={{ marginTop: '15px', padding: '10px', background: 'rgba(20, 241, 149, 0.1)', border: '1px solid #14F195', borderRadius: '8px', color: '#14F195', fontWeight: '900', fontSize: '11px', textAlign: 'center' }}>
                   ✔️ GENESIS STATUS ACTIVE
                 </div>
            ) : !walletAddress ? (
                 <button 
                    style={{ marginTop: '10px', backgroundColor: '#eab308', color: '#000' }}
                    onClick={connectPhantom}
                 >
                   CONNECT PHANTOM
                 </button>
            ) : (
                 <button 
                    style={{ backgroundColor: '#14F195', color: '#000', marginTop: '10px' }}
                    onClick={async () => {
                       try {
                          const solanaWeb3 = window.solanaWeb3;
                          if (!solanaWeb3) throw new Error('Solana Web3 not loaded');

                          // Connect to devnet via CDN's Connection
                          const connection = new solanaWeb3.Connection(solanaWeb3.clusterApiUrl('devnet'));

                          const adminPubKey = new solanaWeb3.PublicKey('11111111111111111111111111111111'); 
                          const transaction = new solanaWeb3.Transaction().add(
                              solanaWeb3.SystemProgram.transfer({
                                  fromPubkey: new solanaWeb3.PublicKey(walletAddress),
                                  toPubkey: adminPubKey,
                                  lamports: 0.25 * solanaWeb3.LAMPORTS_PER_SOL
                              })
                          );
                          
                          const { blockhash } = await connection.getLatestBlockhash();
                          transaction.recentBlockhash = blockhash;
                          transaction.feePayer = new solanaWeb3.PublicKey(walletAddress);

                          const { signature } = await window.solana.signAndSendTransaction(transaction);
                          
                          socket.emit('upgradePremium', signature);
                          alert('Transaction sent! You are now premium!');
                       } catch (e) {
                          alert('Payment failed or cancelled.');
                          console.error(e);
                       }
                    }}
                 >
                   ACTIVATE GENESIS
                 </button>
            )}
          </div>

          {gameNotification && (
            <div className={`game-notification ${gameNotification.type}`}>
               {gameNotification.msg}
            </div>
          )}
        </div>
      )}

      {/* Увеличиваем дальность отрисовки (far: 10000), чтобы не было черных ям */}
      <Canvas shadows camera={{ position: [0, 5, 10], fov: 60, far: 10000 }}>
        <World billboards={billboards} players={players} />
        {inGame && <PlayerController players={playersRef.current} droppedCargos={droppedCargos} myPlayerState={me} billboards={billboards} adminKey={adminKey} />}
        {inGame && <OtherPlayers players={players} playersRef={playersRef} />}
        {inGame && droppedCargos.map(item => <CargoBox key={item.id} item={item} />)}
      </Canvas>
    </>
  );
}

export default App;
