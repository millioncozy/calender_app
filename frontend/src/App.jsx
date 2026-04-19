import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import Calendar from 'react-calendar';
import 'react-calendar/dist/Calendar.css';
import './App.css';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

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
  const [activeTab, setActiveTab] = useState('calendar');

  const authHeaders = useMemo(
    () => ({ headers: { Authorization: `Bearer ${token}` } }),
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

  function showMessage(msg) {
    setMessage(msg);
    setTimeout(() => setMessage(''), 3000);
  }

  async function handleAuth() {
    try {
      const endpoint = mode === 'login' ? '/auth/login' : '/auth/register';
      const res = await axios.post(`${API_BASE_URL}${endpoint}`, { username, password });
      localStorage.setItem('token', res.data.token);
      localStorage.setItem('user', JSON.stringify(res.data.user));
      setToken(res.data.token);
      setUser(res.data.user);
      showMessage(`${mode === 'login' ? '로그인' : '회원가입'} 성공`);
    } catch (error) {
      showMessage(error.response?.data?.message || '요청 실패');
    }
  }

  async function loadSchedules() {
    if (!token) return;
    try {
      const res = await axios.get(`${API_BASE_URL}/schedules`, authHeaders);
      setSchedules(res.data);
    } catch {}
  }

  async function loadFriends() {
    if (!token) return;
    try {
      const res = await axios.get(`${API_BASE_URL}/friends`, authHeaders);
      setFriends(res.data);
    } catch {}
  }

  async function addSchedule() {
    if (!scheduleText.trim()) {
      showMessage('일정 내용을 입력하세요.');
      return;
    }
    try {
      await axios.post(`${API_BASE_URL}/schedules`, { date: selectedDateString, text: scheduleText }, authHeaders);
      setScheduleText('');
      showMessage('일정 추가 완료');
      loadSchedules();
    } catch (error) {
      showMessage(error.response?.data?.message || '일정 추가 실패');
    }
  }

  async function searchUsers() {
    try {
      const res = await axios.get(
        `${API_BASE_URL}/users/search?username=${encodeURIComponent(searchKeyword)}`,
        authHeaders
      );
      setSearchResults(res.data);
    } catch {
      showMessage('유저 검색 실패');
    }
  }

  async function addFriend(friendId) {
    try {
      await axios.post(`${API_BASE_URL}/friends`, { friendId }, authHeaders);
      showMessage('친구 추가 완료');
      loadFriends();
      setSearchResults([]);
      setSearchKeyword('');
    } catch (error) {
      showMessage(error.response?.data?.message || '친구 추가 실패');
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
  }

  useEffect(() => {
    const storedUser = localStorage.getItem('user');
    if (storedUser) setUser(JSON.parse(storedUser));
  }, []);

  useEffect(() => {
    if (token) {
      loadSchedules();
      loadFriends();
    }
  }, [token]);

  if (!token || !user) {
    return (
      <div className="login-screen">
        <h1 className="login-title">보라매의 꿈</h1>
        <p className="login-subtitle">친구와 일정을 함께 공유해요</p>
        <div className="login-card">
          <div className="login-tab-row">
            <button
              className={`login-tab ${mode === 'login' ? 'active' : ''}`}
              onClick={() => setMode('login')}
            >로그인</button>
            <button
              className={`login-tab ${mode === 'register' ? 'active' : ''}`}
              onClick={() => setMode('register')}
            >회원가입</button>
          </div>
          <div className="input-group">
            <label>아이디</label>
            <input
              placeholder="아이디를 입력하세요"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
          </div>
          <div className="input-group">
            <label>비밀번호</label>
            <input
              type="password"
              placeholder="비밀번호를 입력하세요"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAuth()}
            />
          </div>
          <button className="btn-primary" onClick={handleAuth}>
            {mode === 'login' ? '로그인' : '회원가입'}
          </button>
          {message && <p className="login-message">{message}</p>}
        </div>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <div>
          <div className="app-header-title">보라매의 꿈</div>
          <div className="app-header-sub">{user.username}님의 캘린더</div>
        </div>
        <button className="btn-logout" onClick={logout}>로그아웃</button>
      </header>

      <div className="tab-content">
        {message && <div className="toast">{message}</div>}

        {activeTab === 'calendar' && (
          <>
            <div className="calendar-wrapper">
              <Calendar
                onChange={setSelectedDate}
                value={selectedDate}
                tileContent={({ date, view }) => {
                  if (view !== 'month') return null;
                  const key = formatDate(date);
                  return schedulesByDate[key]?.length > 0
                    ? <div className="tile-dot" />
                    : null;
                }}
              />
            </div>

            <div className="card">
              <div className="card-title">📅 {selectedDateString} 일정 추가</div>
              <div className="schedule-input-row">
                <input
                  placeholder="일정 내용 입력"
                  value={scheduleText}
                  onChange={(e) => setScheduleText(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && addSchedule()}
                />
                <button className="btn-add" onClick={addSchedule}>추가</button>
              </div>
            </div>

            <div className="card">
              <div className="card-title">📋 {selectedDateString} 일정 목록</div>
              {selectedSchedules.length === 0 ? (
                <p className="empty-text">등록된 일정이 없어요</p>
              ) : (
                <ul className="schedule-list">
                  {selectedSchedules.map((item) => (
                    <li key={item.id} className="schedule-item">
                      <span className="schedule-item-user">{item.username}</span>
                      <span className="schedule-item-text">{item.text}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
        )}

        {activeTab === 'friends' && (
          <>
            <div className="card">
              <div className="card-title">🔍 친구 검색</div>
              <div className="search-row">
                <input
                  placeholder="아이디로 검색"
                  value={searchKeyword}
                  onChange={(e) => setSearchKeyword(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && searchUsers()}
                />
                <button className="btn-search" onClick={searchUsers}>검색</button>
              </div>
              {searchResults.length > 0 && (
                <ul className="user-list">
                  {searchResults.map((item) => (
                    <li key={item.id} className="user-item">
                      <span className="user-item-name">
                        <span className="avatar">{item.username[0]}</span>
                        {item.username}
                      </span>
                      <button className="btn-friend-add" onClick={() => addFriend(item.id)}>
                        + 추가
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="card">
              <div className="card-title">👥 내 친구</div>
              {friends.length === 0 ? (
                <p className="empty-text">아직 친구가 없어요</p>
              ) : (
                <ul className="user-list">
                  {friends.map((friend) => (
                    <li key={friend.id} className="user-item">
                      <span className="user-item-name">
                        <span className="avatar">{friend.username[0]}</span>
                        {friend.username}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
        )}
      </div>

      <nav className="bottom-nav">
        <button
          className={`nav-btn ${activeTab === 'calendar' ? 'active' : ''}`}
          onClick={() => setActiveTab('calendar')}
        >
          <span className="nav-icon">📅</span>
          캘린더
        </button>
        <button
          className={`nav-btn ${activeTab === 'friends' ? 'active' : ''}`}
          onClick={() => setActiveTab('friends')}
        >
          <span className="nav-icon">👥</span>
          친구
        </button>
      </nav>
    </div>
  );
}

export default App;
