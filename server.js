const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;
const JWT_SECRET = 'secret123';

// 임시 DB (메모리)
let users = [];
let friendships = [];
let schedules = [];

// 토큰 생성
function createToken(user) {
  return jwt.sign(
    { id: user.id, username: user.username },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
}

// 로그인 검사
function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).json({ message: '로그인 필요' });
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ message: '토큰 오류' });
  }
}

// 서버 테스트
app.get('/', (req, res) => {
  res.send('server is working!');
});

// 회원가입
app.post('/auth/register', async (req, res) => {
  const { username, password } = req.body;

  const existingUser = users.find(u => u.username === username);
  if (existingUser) {
    return res.status(400).json({ message: '이미 존재하는 아이디' });
  }

  const hashedPassword = await bcrypt.hash(password, 10);

  const user = {
    id: uuidv4(),
    username,
    password: hashedPassword
  };

  users.push(user);

  const token = createToken(user);

  res.json({ token, user: { id: user.id, username: user.username } });
});

// 로그인
app.post('/auth/login', async (req, res) => {
  const { username, password } = req.body;

  const user = users.find(u => u.username === username);
  if (!user) {
    return res.status(400).json({ message: '아이디 없음' });
  }

  const match = await bcrypt.compare(password, user.password);
  if (!match) {
    return res.status(400).json({ message: '비밀번호 틀림' });
  }

  const token = createToken(user);

  res.json({ token, user: { id: user.id, username: user.username } });
});

// 유저 검색
app.get('/users/search', authMiddleware, (req, res) => {
  const keyword = req.query.username;

  const result = users
    .filter(u => u.username.includes(keyword))
    .filter(u => u.id !== req.user.id)
    .map(u => ({ id: u.id, username: u.username }));

  res.json(result);
});

// 친구 추가
app.post('/friends', authMiddleware, (req, res) => {
  const { friendId } = req.body;

  friendships.push({ userId: req.user.id, friendId });
  friendships.push({ userId: friendId, friendId: req.user.id });

  res.json({ message: '친구 추가 완료' });
});

// 친구 목록
app.get('/friends', authMiddleware, (req, res) => {
  const friendIds = friendships
    .filter(f => f.userId === req.user.id)
    .map(f => f.friendId);

  const friendList = users
    .filter(u => friendIds.includes(u.id))
    .map(u => ({ id: u.id, username: u.username }));

  res.json(friendList);
});

// 일정 추가
app.post('/schedules', authMiddleware, (req, res) => {
  const { date, text } = req.body;

  const schedule = {
    id: uuidv4(),
    userId: req.user.id,
    username: req.user.username,
    date,
    text
  };

  schedules.push(schedule);
  res.json(schedule);
});

// 일정 조회 (내 + 친구)
app.get('/schedules', authMiddleware, (req, res) => {
  const friendIds = friendships
    .filter(f => f.userId === req.user.id)
    .map(f => f.friendId);

  const visible = schedules.filter(
    s => s.userId === req.user.id || friendIds.includes(s.userId)
  );

  res.json(visible);
});

app.listen(PORT, () => {
  console.log('Server running');
});