import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import Calendar from 'react-calendar';
import 'react-calendar/dist/Calendar.css';

const API_BASE_URL = 'https://calenderapp-production-72ab.up.railway.app/';

function App() {
  const [mode, setMode] = useState('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(localStorage.getItem('token') || '');
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [scheduleText, setScheduleText] = useState('');
  const [schedules, setSchedules] = useState([]);
  const [searchKeyword, setSearchKeyword] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [friends, setFriends] = useState([]);
  const [message, setMessage] = useState('');

  const authHeaders = useMemo(
    () => ({
      headers: { Authorization: `Bearer ${token}` },
    }),
    [token]
  );

  const formatDate = (date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const selectedDateString = formatDate(selectedDate);

  const schedulesByDate = schedules.reduce((acc, item) => {
    if (!acc[item.date]) acc[item.date] = [];
    acc[item.date].push(item);
    return acc;
  }, {});

  const selectedSchedules = schedulesByDate[selectedDateString] || [];

  async function handleAuth() {
    try {
      const endpoint = mode === 'login' ? '/auth/login' : '/auth/register';
      const res = await axios.post(`${API_BASE_URL}${endpoint}`, {
        username,
        password,
      });

      localStorage.setItem('token', res.data.token);
      localStorage.setItem('user', JSON.stringify(res.data.user));
      setToken(res.data.token);
      setUser(res.data.user);
      setMessage(`${mode === 'login' ? '로그인' : '회원가입'} 성공`);
    } catch (error) {
      setMessage(error.response?.data?.message || '요청 실패');
    }
  }

  async function loadSchedules() {
    if (!token) return;
    try {
      const res = await axios.get(`${API_BASE_URL}/schedules`, authHeaders);
      setSchedules(res.data);
    } catch (error) {
      setMessage('일정을 불러오지 못했습니다.');
    }
  }

  async function loadFriends() {
    if (!token) return;
    try {
      const res = await axios.get(`${API_BASE_URL}/friends`, authHeaders);
      setFriends(res.data);
    } catch (error) {
      setMessage('친구 목록을 불러오지 못했습니다.');
    }
  }

  async function addSchedule() {
    if (!scheduleText.trim()) {
      setMessage('일정 내용을 입력하세요.');
      return;
    }

    try {
      await axios.post(
        `${API_BASE_URL}/schedules`,
        {
          date: selectedDateString,
          text: scheduleText,
        },
        authHeaders
      );
      setScheduleText('');
      setMessage('일정 추가 완료');
      loadSchedules();
    } catch (error) {
      setMessage(error.response?.data?.message || '일정 추가 실패');
    }
  }

  async function searchUsers() {
    try {
      const res = await axios.get(
        `${API_BASE_URL}/users/search?username=${encodeURIComponent(searchKeyword)}`,
        authHeaders
      );
      setSearchResults(res.data);
    } catch (error) {
      setMessage('유저 검색 실패');
    }
  }

  async function addFriend(friendId) {
    try {
      await axios.post(`${API_BASE_URL}/friends`, { friendId }, authHeaders);
      setMessage('친구 추가 완료');
      loadFriends();
    } catch (error) {
      setMessage(error.response?.data?.message || '친구 추가 실패');
    }
  }

  function logout() {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setToken('');
    setUser(null);
    setSchedules([]);
    setFriends([]);
    setSearchResults([]);
    setMessage('로그아웃됨');
  }

  useEffect(() => {
    const storedUser = localStorage.getItem('user');
    if (storedUser) {
      setUser(JSON.parse(storedUser));
    }
  }, []);

  useEffect(() => {
    if (token) {
      loadSchedules();
      loadFriends();
    }
  }, [token]);

  if (!token || !user) {
    return (
      <div style={{ maxWidth: 420, margin: '60px auto', padding: 24 }}>
        <h1>친구 일정 공유</h1>
        <p>{mode === 'login' ? '로그인' : '회원가입'}</p>
        <input
          placeholder="아이디"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          style={{ width: '100%', padding: 10, marginBottom: 10 }}
        />
        <input
          type="password"
          placeholder="비밀번호"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          style={{ width: '100%', padding: 10, marginBottom: 10 }}
        />
        <button onClick={handleAuth} style={{ width: '100%', padding: 12 }}>
          {mode === 'login' ? '로그인' : '회원가입'}
        </button>
        <button
          onClick={() => setMode(mode === 'login' ? 'register' : 'login')}
          style={{ width: '100%', padding: 12, marginTop: 10 }}
        >
          {mode === 'login' ? '회원가입 하러 가기' : '로그인 하러 가기'}
        </button>
        {message && <p style={{ marginTop: 12 }}>{message}</p>}
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 1100, margin: '20px auto', padding: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1>{user.username}의 캘린더</h1>
          <p>내 일정과 친구 일정을 함께 볼 수 있어요.</p>
        </div>
        <button onClick={logout}>로그아웃</button>
      </div>

      {message && <p>{message}</p>}

      <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr', gap: 24, marginTop: 20 }}>
        <div>
          <Calendar
            onChange={setSelectedDate}
            value={selectedDate}
            tileContent={({ date, view }) => {
              if (view !== 'month') return null;
              const dateKey = formatDate(date);
              const count = schedulesByDate[dateKey]?.length || 0;
              return count > 0 ? (
                <div style={{ fontSize: 10, marginTop: 4 }}>{count}개 일정</div>
              ) : null;
            }}
          />

          <div style={{ marginTop: 20, border: '1px solid #ddd', padding: 16, borderRadius: 8 }}>
            <h3>{selectedDateString} 일정 추가</h3>
            <input
              placeholder="일정 내용을 입력하세요"
              value={scheduleText}
              onChange={(e) => setScheduleText(e.target.value)}
              style={{ width: '100%', padding: 10, marginBottom: 10 }}
            />
            <button onClick={addSchedule}>일정 저장</button>
          </div>
        </div>

        <div>
          <div style={{ border: '1px solid #ddd', padding: 16, borderRadius: 8, marginBottom: 20 }}>
            <h3>{selectedDateString} 일정 목록</h3>
            {selectedSchedules.length === 0 ? (
              <p>등록된 일정이 없습니다.</p>
            ) : (
              <ul>
                {selectedSchedules.map((item) => (
                  <li key={item.id} style={{ marginBottom: 10 }}>
                    <strong>{item.username}</strong>: {item.text}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div style={{ border: '1px solid #ddd', padding: 16, borderRadius: 8, marginBottom: 20 }}>
            <h3>친구 검색</h3>
            <input
              placeholder="아이디로 검색"
              value={searchKeyword}
              onChange={(e) => setSearchKeyword(e.target.value)}
              style={{ width: '100%', padding: 10, marginBottom: 10 }}
            />
            <button onClick={searchUsers}>검색</button>
            <ul style={{ marginTop: 12 }}>
              {searchResults.map((item) => (
                <li key={item.id} style={{ marginBottom: 10 }}>
                  {item.username}{' '}
                  <button onClick={() => addFriend(item.id)}>친구 추가</button>
                </li>
              ))}
            </ul>
          </div>

          <div style={{ border: '1px solid #ddd', padding: 16, borderRadius: 8 }}>
            <h3>내 친구</h3>
            {friends.length === 0 ? (
              <p>아직 친구가 없습니다.</p>
            ) : (
              <ul>
                {friends.map((friend) => (
                  <li key={friend.id}>{friend.username}</li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;