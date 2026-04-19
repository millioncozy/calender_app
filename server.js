const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'secret123';

let users = [];
let friendships = [];
let friendRequests = [];
let schedules = [];

function createToken(user) {
  return jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '7d' });
}

function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ message: '로그인 필요' });
  const token = authHeader.split(' ')[1];
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ message: '토큰 오류' });
  }
}

function isFriend(userIdA, userIdB) {
  return friendships.some(
    f => (f.userId === userIdA && f.friendId === userIdB)
  );
}

// ── 헬스체크 ──
app.get('/', (req, res) => res.send('server is working!'));

// ── 회원가입 ──
app.post('/auth/register', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password)
    return res.status(400).json({ message: '아이디/비밀번호 필요' });
  if (users.find(u => u.username === username))
    return res.status(400).json({ message: '이미 존재하는 아이디' });

  const hashedPassword = await bcrypt.hash(password, 10);
  const user = { id: uuidv4(), username, password: hashedPassword };
  users.push(user);
  res.json({ token: createToken(user), user: { id: user.id, username: user.username } });
});

// ── 로그인 ──
app.post('/auth/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password)
    return res.status(400).json({ message: '아이디/비밀번호 필요' });

  const user = users.find(u => u.username === username);
  if (!user) return res.status(400).json({ message: '아이디 없음' });

  const match = await bcrypt.compare(password, user.password);
  if (!match) return res.status(400).json({ message: '비밀번호 틀림' });

  res.json({ token: createToken(user), user: { id: user.id, username: user.username } });
});

// ── 유저 검색 ──
app.get('/users/search', authMiddleware, (req, res) => {
  const keyword = req.query.username || '';
  const result = users
    .filter(u => u.username.includes(keyword) && u.id !== req.user.id)
    .map(u => ({ id: u.id, username: u.username }));
  res.json(result);
});

// ── 친구 목록 ──
app.get('/friends', authMiddleware, (req, res) => {
  const friendIds = friendships
    .filter(f => f.userId === req.user.id)
    .map(f => f.friendId);
  const friendList = users
    .filter(u => friendIds.includes(u.id))
    .map(u => ({ id: u.id, username: u.username }));
  res.json(friendList);
});

// ── 친구 요청 보내기 ──
app.post('/friends/request', authMiddleware, (req, res) => {
  const { toId } = req.body;
  const fromId = req.user.id;

  if (!toId) return res.status(400).json({ message: 'toId 필요' });
  if (toId === fromId) return res.status(400).json({ message: '자신에게 친구 요청 불가' });
  if (isFriend(fromId, toId)) return res.status(400).json({ message: '이미 친구입니다' });

  const duplicate = friendRequests.find(
    r => r.fromId === fromId && r.toId === toId && r.status === 'pending'
  );
  if (duplicate) return res.status(400).json({ message: '이미 요청을 보냈습니다' });

  const reverseRequest = friendRequests.find(
    r => r.fromId === toId && r.toId === fromId && r.status === 'pending'
  );
  if (reverseRequest) return res.status(400).json({ message: '상대방이 이미 요청을 보냈습니다. 받은 요청을 확인해 주세요.' });

  const request = { id: uuidv4(), fromId, toId, status: 'pending', createdAt: new Date().toISOString() };
  friendRequests.push(request);

  const fromUser = users.find(u => u.id === fromId);
  const toUser = users.find(u => u.id === toId);
  res.json({
    ...request,
    fromUsername: fromUser?.username,
    toUsername: toUser?.username,
  });
});

// ── 친구 요청 목록 (받은 것 + 보낸 것) ──
app.get('/friends/requests', authMiddleware, (req, res) => {
  const userId = req.user.id;

  const received = friendRequests
    .filter(r => r.toId === userId && r.status === 'pending')
    .map(r => ({
      ...r,
      fromUsername: users.find(u => u.id === r.fromId)?.username,
      toUsername: users.find(u => u.id === r.toId)?.username,
    }));

  const sent = friendRequests
    .filter(r => r.fromId === userId && r.status === 'pending')
    .map(r => ({
      ...r,
      fromUsername: users.find(u => u.id === r.fromId)?.username,
      toUsername: users.find(u => u.id === r.toId)?.username,
    }));

  res.json({ received, sent });
});

// ── 친구 요청 수락 ──
app.put('/friends/requests/:id/accept', authMiddleware, (req, res) => {
  const request = friendRequests.find(r => r.id === req.params.id);
  if (!request || request.status !== 'pending')
    return res.status(404).json({ message: '요청 없음' });
  if (request.toId !== req.user.id)
    return res.status(403).json({ message: '권한 없음' });

  request.status = 'accepted';
  friendships.push({ userId: request.fromId, friendId: request.toId });
  friendships.push({ userId: request.toId, friendId: request.fromId });

  res.json({ message: '친구 요청 수락 완료' });
});

// ── 친구 요청 거절 / 취소 ──
app.delete('/friends/requests/:id', authMiddleware, (req, res) => {
  const idx = friendRequests.findIndex(r => r.id === req.params.id);
  if (idx === -1) return res.status(404).json({ message: '요청 없음' });

  const request = friendRequests[idx];
  if (request.toId !== req.user.id && request.fromId !== req.user.id)
    return res.status(403).json({ message: '권한 없음' });

  friendRequests.splice(idx, 1);
  res.json({ message: '친구 요청 처리 완료' });
});

// ── 일정 추가 ──
app.post('/schedules', authMiddleware, (req, res) => {
  const { date, text } = req.body;
  if (!date || !text) return res.status(400).json({ message: 'date/text 필요' });

  const schedule = {
    id: uuidv4(),
    userId: req.user.id,
    username: req.user.username,
    date,
    text,
  };
  schedules.push(schedule);
  res.json(schedule);
});

// ── 일정 목록 (내 것 + 친구 것) ──
app.get('/schedules', authMiddleware, (req, res) => {
  const friendIds = friendships
    .filter(f => f.userId === req.user.id)
    .map(f => f.friendId);

  const visible = schedules.filter(
    s => s.userId === req.user.id || friendIds.includes(s.userId)
  );
  res.json(visible);
});

// ── 일정 수정 ──
app.put('/schedules/:id', authMiddleware, (req, res) => {
  const schedule = schedules.find(s => s.id === req.params.id);
  if (!schedule) return res.status(404).json({ message: '일정 없음' });
  if (schedule.userId !== req.user.id) return res.status(403).json({ message: '본인 일정만 수정 가능' });

  const { text, date } = req.body;
  if (text !== undefined) schedule.text = text;
  if (date !== undefined) schedule.date = date;
  res.json(schedule);
});

// ── 일정 삭제 ──
app.delete('/schedules/:id', authMiddleware, (req, res) => {
  const idx = schedules.findIndex(s => s.id === req.params.id);
  if (idx === -1) return res.status(404).json({ message: '일정 없음' });
  if (schedules[idx].userId !== req.user.id) return res.status(403).json({ message: '본인 일정만 삭제 가능' });

  schedules.splice(idx, 1);
  res.json({ message: '삭제 완료' });
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
