const express = require('express');
  }

  if (friendId === req.user.id) {
    return res.status(400).json({ message: '자기 자신은 친구 추가할 수 없습니다.' });
  }

  const targetUser = users.find((user) => user.id === friendId);
  if (!targetUser) {
    return res.status(404).json({ message: '대상 유저를 찾을 수 없습니다.' });
  }

  const alreadyFriend = friendships.some(
    (item) =>
      (item.userId === req.user.id && item.friendId === friendId) ||
      (item.userId === friendId && item.friendId === req.user.id)
  );

  if (alreadyFriend) {
    return res.status(400).json({ message: '이미 친구입니다.' });
  }

  friendships.push({ userId: req.user.id, friendId });
  friendships.push({ userId: friendId, friendId: req.user.id });

  res.json({ message: '친구 추가 완료' });
});

// 친구 목록
app.get('/friends', authMiddleware, (req, res) => {
  const friendIds = friendships
    .filter((item) => item.userId === req.user.id)
    .map((item) => item.friendId);

  const friendList = users
    .filter((user) => friendIds.includes(user.id))
    .map((user) => ({ id: user.id, username: user.username }));

  res.json(friendList);
});

// 일정 추가
app.post('/schedules', authMiddleware, (req, res) => {
  const { date, text } = req.body;

  if (!date || !text) {
    return res.status(400).json({ message: 'date와 text를 입력하세요.' });
  }

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

// 보이는 일정 조회 (내 일정 + 친구 일정)
app.get('/schedules', authMiddleware, (req, res) => {
  const friendIds = friendships
    .filter((item) => item.userId === req.user.id)
    .map((item) => item.friendId);

  const visibleSchedules = schedules.filter(
    (item) => item.userId === req.user.id || friendIds.includes(item.userId)
  );

  res.json(visibleSchedules);
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
