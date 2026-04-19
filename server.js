const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { Pool } = require('pg');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'secret123';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

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

// ── 헬스체크 ──
app.get('/', (req, res) => res.send('server is working!'));

// ── 회원가입 ──
app.post('/auth/register', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password)
    return res.status(400).json({ message: '아이디/비밀번호 필요' });

  try {
    const existing = await pool.query('SELECT id FROM users WHERE username = $1', [username]);
    if (existing.rows.length > 0)
      return res.status(400).json({ message: '이미 존재하는 아이디' });

    const hashedPassword = await bcrypt.hash(password, 10);
    const result = await pool.query(
      'INSERT INTO users (username, password) VALUES ($1, $2) RETURNING id, username',
      [username, hashedPassword]
    );
    const user = result.rows[0];
    res.json({ token: createToken(user), user: { id: user.id, username: user.username } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: '서버 오류' });
  }
});

// ── 로그인 ──
app.post('/auth/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password)
    return res.status(400).json({ message: '아이디/비밀번호 필요' });

  try {
    const result = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
    if (result.rows.length === 0)
      return res.status(400).json({ message: '아이디 없음' });

    const user = result.rows[0];
    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(400).json({ message: '비밀번호 틀림' });

    res.json({ token: createToken(user), user: { id: user.id, username: user.username } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: '서버 오류' });
  }
});

// ── 내 프로필 조회 ──
app.get('/users/me', authMiddleware, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, username, enlistment_date, discharge_date FROM users WHERE id = $1',
      [req.user.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ message: '유저 없음' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: '서버 오류' });
  }
});

// ── 군 복무 날짜 저장 ──
app.put('/users/me', authMiddleware, async (req, res) => {
  const { enlistmentDate, dischargeDate } = req.body;
  try {
    const result = await pool.query(
      `UPDATE users SET enlistment_date = $1, discharge_date = $2 WHERE id = $3
       RETURNING id, username, enlistment_date, discharge_date`,
      [enlistmentDate || null, dischargeDate || null, req.user.id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: '서버 오류' });
  }
});

// ── 유저 검색 ──
app.get('/users/search', authMiddleware, async (req, res) => {
  const keyword = req.query.username || '';
  try {
    const result = await pool.query(
      'SELECT id, username FROM users WHERE username ILIKE $1 AND id != $2',
      [`%${keyword}%`, req.user.id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: '서버 오류' });
  }
});

// ── 친구 목록 (군 복무 정보 포함) ──
app.get('/friends', authMiddleware, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT u.id, u.username, u.enlistment_date, u.discharge_date
       FROM friendships f
       JOIN users u ON u.id = f.friend_id
       WHERE f.user_id = $1`,
      [req.user.id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: '서버 오류' });
  }
});

// ── 친구 요청 보내기 ──
app.post('/friends/request', authMiddleware, async (req, res) => {
  const { toId } = req.body;
  const fromId = req.user.id;

  if (!toId) return res.status(400).json({ message: 'toId 필요' });
  if (toId === fromId) return res.status(400).json({ message: '자신에게 친구 요청 불가' });

  try {
    const alreadyFriend = await pool.query(
      'SELECT 1 FROM friendships WHERE user_id = $1 AND friend_id = $2',
      [fromId, toId]
    );
    if (alreadyFriend.rows.length > 0)
      return res.status(400).json({ message: '이미 친구입니다' });

    const pending = await pool.query(
      `SELECT 1 FROM friend_requests WHERE from_id = $1 AND to_id = $2 AND status = 'pending'`,
      [fromId, toId]
    );
    if (pending.rows.length > 0)
      return res.status(400).json({ message: '이미 요청을 보냈습니다' });

    const reverse = await pool.query(
      `SELECT 1 FROM friend_requests WHERE from_id = $1 AND to_id = $2 AND status = 'pending'`,
      [toId, fromId]
    );
    if (reverse.rows.length > 0)
      return res.status(400).json({ message: '상대방이 이미 요청을 보냈습니다. 받은 요청을 확인해 주세요.' });

    const result = await pool.query(
      `INSERT INTO friend_requests (from_id, to_id) VALUES ($1, $2)
       ON CONFLICT (from_id, to_id) DO NOTHING
       RETURNING *`,
      [fromId, toId]
    );

    const toUser = await pool.query('SELECT username FROM users WHERE id = $1', [toId]);
    res.json({ ...result.rows[0], fromUsername: req.user.username, toUsername: toUser.rows[0]?.username });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: '서버 오류' });
  }
});

// ── 친구 요청 목록 ──
app.get('/friends/requests', authMiddleware, async (req, res) => {
  const userId = req.user.id;
  try {
    const received = await pool.query(
      `SELECT fr.id, fr.from_id, fr.to_id, fr.status, fr.created_at,
              u.username AS "fromUsername"
       FROM friend_requests fr
       JOIN users u ON u.id = fr.from_id
       WHERE fr.to_id = $1 AND fr.status = 'pending'`,
      [userId]
    );

    const sent = await pool.query(
      `SELECT fr.id, fr.from_id, fr.to_id, fr.status, fr.created_at,
              u.username AS "toUsername"
       FROM friend_requests fr
       JOIN users u ON u.id = fr.to_id
       WHERE fr.from_id = $1 AND fr.status = 'pending'`,
      [userId]
    );

    res.json({ received: received.rows, sent: sent.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: '서버 오류' });
  }
});

// ── 친구 요청 수락 ──
app.put('/friends/requests/:id/accept', authMiddleware, async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const reqResult = await client.query(
      `SELECT * FROM friend_requests WHERE id = $1 AND status = 'pending'`,
      [req.params.id]
    );
    if (reqResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: '요청 없음' });
    }
    const fr = reqResult.rows[0];
    if (fr.to_id !== req.user.id) {
      await client.query('ROLLBACK');
      return res.status(403).json({ message: '권한 없음' });
    }

    await client.query(
      `UPDATE friend_requests SET status = 'accepted' WHERE id = $1`,
      [req.params.id]
    );
    await client.query(
      `INSERT INTO friendships (user_id, friend_id) VALUES ($1, $2), ($2, $1) ON CONFLICT DO NOTHING`,
      [fr.from_id, fr.to_id]
    );

    await client.query('COMMIT');
    res.json({ message: '친구 요청 수락 완료' });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ message: '서버 오류' });
  } finally {
    client.release();
  }
});

// ── 친구 요청 거절 / 취소 ──
app.delete('/friends/requests/:id', authMiddleware, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM friend_requests WHERE id = $1',
      [req.params.id]
    );
    if (result.rows.length === 0)
      return res.status(404).json({ message: '요청 없음' });

    const fr = result.rows[0];
    if (fr.to_id !== req.user.id && fr.from_id !== req.user.id)
      return res.status(403).json({ message: '권한 없음' });

    await pool.query('DELETE FROM friend_requests WHERE id = $1', [req.params.id]);
    res.json({ message: '처리 완료' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: '서버 오류' });
  }
});

// ── 일정 추가 ──
app.post('/schedules', authMiddleware, async (req, res) => {
  const { date, text } = req.body;
  if (!date || !text) return res.status(400).json({ message: 'date/text 필요' });

  try {
    const result = await pool.query(
      'INSERT INTO schedules (user_id, username, date, text) VALUES ($1, $2, $3, $4) RETURNING *',
      [req.user.id, req.user.username, date, text]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: '서버 오류' });
  }
});

// ── 일정 목록 (내 것 + 친구 것) ──
app.get('/schedules', authMiddleware, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT s.*
       FROM schedules s
       WHERE s.user_id = $1
          OR s.user_id IN (
            SELECT friend_id FROM friendships WHERE user_id = $1
          )
       ORDER BY s.date, s.created_at`,
      [req.user.id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: '서버 오류' });
  }
});

// ── 일정 수정 ──
app.put('/schedules/:id', authMiddleware, async (req, res) => {
  const { text, date } = req.body;
  try {
    const existing = await pool.query('SELECT * FROM schedules WHERE id = $1', [req.params.id]);
    if (existing.rows.length === 0)
      return res.status(404).json({ message: '일정 없음' });
    if (existing.rows[0].user_id !== req.user.id)
      return res.status(403).json({ message: '본인 일정만 수정 가능' });

    const result = await pool.query(
      `UPDATE schedules
       SET text = COALESCE($1, text), date = COALESCE($2, date)
       WHERE id = $3
       RETURNING *`,
      [text || null, date || null, req.params.id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: '서버 오류' });
  }
});

// ── 일정 삭제 ──
app.delete('/schedules/:id', authMiddleware, async (req, res) => {
  try {
    const existing = await pool.query('SELECT * FROM schedules WHERE id = $1', [req.params.id]);
    if (existing.rows.length === 0)
      return res.status(404).json({ message: '일정 없음' });
    if (existing.rows[0].user_id !== req.user.id)
      return res.status(403).json({ message: '본인 일정만 삭제 가능' });

    await pool.query('DELETE FROM schedules WHERE id = $1', [req.params.id]);
    res.json({ message: '삭제 완료' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: '서버 오류' });
  }
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
