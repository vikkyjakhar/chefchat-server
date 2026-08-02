import { createServer } from 'http';
import { Server } from 'socket.io';

const PORT = process.env.PORT || 3001;
const httpServer = createServer();
const io = new Server(httpServer, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
  maxHttpBufferSize: 7e6,
});

const rooms = {};
const roomPasswords = {};
const roomCreators = {};
const getUsers = (roomId) => Object.values(rooms[roomId] ?? {});
const ts = () => new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
const uid = () => Math.random().toString(36).slice(2, 10);

io.on('connection', (socket) => {
  let currentRoom = null;
  let currentName = null;

  socket.on('join', ({ roomId, userName, password }) => {
    const name = String(userName ?? '').trim().slice(0, 20);
    const room = String(roomId ?? '').trim().slice(0, 32);
    const pass = String(password ?? '').trim();
    if (!name || !room) return;

    const roomExists = !!rooms[room];
    if (roomExists) {
      const expected = roomPasswords[room] ?? '';
      if (expected && pass !== expected) {
        socket.emit('join:error', { message: 'Incorrect room password.' });
        return;
      }
    } else {
      roomPasswords[room] = pass;
      roomCreators[room] = socket.id;
    }

    currentRoom = room;
    currentName = name;
    socket.join(room);
    if (!rooms[room]) rooms[room] = {};
    rooms[room][socket.id] = { id: socket.id, name };
    socket.emit('users', getUsers(room));
    socket.to(room).emit('user:joined', { id: socket.id, name });
    socket.to(room).emit('users', getUsers(room));
    io.to(room).emit('system', { text: name + ' joined the chat', timestamp: ts() });
  });

  socket.on('message', ({ text, timestamp }) => {
    if (!currentRoom) return;
    const safe = String(text ?? '').trim().slice(0, 500);
    if (!safe) return;
    socket.to(currentRoom).emit('message', {
      id: uid(), text: safe, sender: currentName,
      senderId: socket.id, timestamp: timestamp ?? ts(),
    });
  });

  socket.on('typing', () => {
    if (currentRoom) socket.to(currentRoom).emit('typing', { name: currentName, id: socket.id });
  });

  socket.on('file', ({ id, fileName, fileType, fileData, fileSize, timestamp }) => {
    if (!currentRoom) return;
    socket.to(currentRoom).emit('file', {
      id, fileName, fileType, fileData, fileSize,
      sender: currentName, senderId: socket.id,
      timestamp: timestamp ?? ts(),
    });
  });

  socket.on('disconnect', () => {
    if (!currentRoom) return;
    delete (rooms[currentRoom] ?? {})[socket.id];
    io.to(currentRoom).emit('user:left', { id: socket.id, name: currentName });
    io.to(currentRoom).emit('users', getUsers(currentRoom));
    io.to(currentRoom).emit('system', { text: currentName + ' left the chat', timestamp: ts() });
    if (!Object.keys(rooms[currentRoom] ?? {}).length) delete rooms[currentRoom];
  });
});

httpServer.listen(PORT, () => console.log('ChefChat server on port ' + PORT));
