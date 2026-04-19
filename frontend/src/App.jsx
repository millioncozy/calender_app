import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import Calendar from 'react-calendar';
import 'react-calendar/dist/Calendar.css';
import './App.css';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

function calcProgress(enlistmentDate, dischargeDate) {
  if (!enlistmentDate || !dischargeDate) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const enlist = new Date(enlistmentDate);
  const discharge = new Date(dischargeDate);
  if (today < enlist) return 0;
  if (today >= discharge) return 100;
  const pct = ((today - enlist) / (discharge - enlist)) * 100;
  return Math.round(pct * 100) / 100;
}

function ProgressBar({ enlistmentDate, dischargeDate, username }) {
  const pct = calcProgress(enlistmentDate, dischargeDate);
  if (pct === null) {
    return <p className="empty-text">{username ? `${username}: 복무 정보 없음` : '복무 날짜를 등록해 주세요'}</p>;
  }
  return (
    <div className="progress-wrap">
      {username && <span className="progress-username">{username}</span>}
      <div className="progress-bar-bg">
        <div className="progress-bar-fill" style={{ width: `${pct}%` }} />
      </div>
      <span className="progress-pct">{pct.toFixed(2)}%</span>
    </div>
  );
}

function App() {
  const [mode, setMode] = useState('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(localStorage.getItem('token') || '');
  const [activeTab, setActiveTab] = useState('home');

  // 홈 탭
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [scheduleText, setScheduleText] = useState('');
  const [schedules, setSchedules] = useState([]);
  const [editingId, setEditingId] = useState(null);
  const [editingText, setEditingText] = useState('');

  // 친구 탭
  const [searchKeyword, setSearchKeyword] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [friends, setFriends] = useState([]);
  const [friendRequests, setFriendRequests] = useState({ received: [], sent: [] });
  const [friendTab, setFriendTab] = useState('list');

  // 군 복무
  const [enlistmentDate, setEnlistmentDate] = useState('');
  const [dischargeDate, setDischargeDate] = useState('');
  const [militarySaved, setMilitarySaved] = useState(false);

  const [message, setMessage] = useState('');

  const authHeaders = useMemo(
    () => ({ headers: { Authorization: `Bearer ${token}` } }),
    [token]
  );

  const formatDate = (date) => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
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

  // ── 인증 ──
  async function handleAuth() {
    try {
      const endpoint = mode === 'login' ? '/auth/login' : '/auth/register';
      const res = await axios.post(`${API_BASE_URL}${endpoint}`, { username, password });
      localStorage.setItem('token', res.data.token);
      localStorage.setItem('user', JSON.stringify(res.data.user));
      setToken(res.data.token);
      setUser(res.data.user);
    } catch (error) {
      showMessage(error.response?.data?.message || '요청 실패');
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
    setFriendRequests({ received: [], sent: [] });
  }

  // ── 일정 ──
  async function loadMyProfile() {
    if (!token) return;
    try {
      const res = await axios.get(`${API_BASE_URL}/users/me`, authHeaders);
      if (res.data.enlistment_date) setEnlistmentDate(res.data.enlistment_date.slice(0, 10));
      if (res.data.discharge_date) setDischargeDate(res.data.discharge_date.slice(0, 10));
    } catch {}
  }

  async function saveMilitaryDates() {
    try {
      await axios.put(`${API_BASE_URL}/users/me`, { enlistmentDate, dischargeDate }, authHeaders);
      setMilitarySaved(true);
      showMessage('복무 날짜가 저장되었습니다');
      setTimeout(() => setMilitarySaved(false), 2000);
    } catch (error) {
      showMessage(error.response?.data?.message || '저장 실패');
    }
  }

  async function loadSchedules() {
    if (!token) return;
    try {
      const res = await axios.get(`${API_BASE_URL}/schedules`, authHeaders);
      setSchedules(res.data);
    } catch {}
  }

  async function addSchedule() {
    if (!scheduleText.trim()) { showMessage('일정 내용을 입력하세요.'); return; }
    try {
      await axios.post(`${API_BASE_URL}/schedules`, { date: selectedDateString, text: scheduleText }, authHeaders);
      setScheduleText('');
      loadSchedules();
    } catch (error) {
      showMessage(error.response?.data?.message || '일정 추가 실패');
    }
  }

  async function updateSchedule(id) {
    if (!editingText.trim()) return;
    try {
      await axios.put(`${API_BASE_URL}/schedules/${id}`, { text: editingText }, authHeaders);
      setEditingId(null);
      setEditingText('');
      loadSchedules();
    } catch (error) {
      showMessage(error.response?.data?.message || '수정 실패');
    }
  }

  async function deleteSchedule(id) {
    try {
      await axios.delete(`${API_BASE_URL}/schedules/${id}`, authHeaders);
      loadSchedules();
    } catch (error) {
      showMessage(error.response?.data?.message || '삭제 실패');
    }
  }

  // ── 친구 ──
  async function loadFriends() {
    if (!token) return;
    try {
      const res = await axios.get(`${API_BASE_URL}/friends`, authHeaders);
      setFriends(res.data);
    } catch {}
  }

  async function loadFriendRequests() {
    if (!token) return;
    try {
      const res = await axios.get(`${API_BASE_URL}/friends/requests`, authHeaders);
      setFriendRequests(res.data);
    } catch {}
  }

  async function searchUsers() {
    try {
      const res = await axios.get(
        `${API_BASE_URL}/users/search?username=${encodeURIComponent(searchKeyword)}`,
        authHeaders
      );
      setSearchResults(res.data);
    } catch { showMessage('유저 검색 실패'); }
  }

  async function sendFriendRequest(toId) {
    try {
      await axios.post(`${API_BASE_URL}/friends/request`, { toId }, authHeaders);
      showMessage('친구 요청을 보냈습니다');
      setSearchResults([]);
      setSearchKeyword('');
      loadFriendRequests();
    } catch (error) {
      showMessage(error.response?.data?.message || '요청 실패');
    }
  }

  async function acceptRequest(requestId) {
    try {
      await axios.put(`${API_BASE_URL}/friends/requests/${requestId}/accept`, {}, authHeaders);
      showMessage('친구 요청을 수락했습니다');
      loadFriends();
      loadFriendRequests();
    } catch (error) {
      showMessage(error.response?.data?.message || '수락 실패');
    }
  }

  async function rejectRequest(requestId) {
    try {
      await axios.delete(`${API_BASE_URL}/friends/requests/${requestId}`, authHeaders);
      showMessage('친구 요청을 거절했습니다');
      loadFriendRequests();
    } catch (error) {
      showMessage(error.response?.data?.message || '거절 실패');
    }
  }

  async function cancelRequest(requestId) {
    try {
      await axios.delete(`${API_BASE_URL}/friends/requests/${requestId}`, authHeaders);
      showMessage('친구 요청을 취소했습니다');
      loadFriendRequests();
    } catch (error) {
      showMessage(error.response?.data?.message || '취소 실패');
    }
  }

  useEffect(() => {
    const storedUser = localStorage.getItem('user');
    if (storedUser) setUser(JSON.parse(storedUser));
  }, []);

  useEffect(() => {
    if (token) {
      loadSchedules();
      loadFriends();
      loadFriendRequests();
      loadMyProfile();
    }
  }, [token]);

  const receivedCount = friendRequests.received.length;

  // ── 로그인 화면 ──
  if (!token || !user) {
    return (
      <div className="login-screen">
        <h1 className="login-title">보라매의 꿈</h1>
        <p className="login-subtitle">친구와 일정을 함께 공유해요</p>
        <div className="login-card">
          <div className="login-tab-row">
            <button className={`login-tab ${mode === 'login' ? 'active' : ''}`} onClick={() => setMode('login')}>로그인</button>
            <button className={`login-tab ${mode === 'register' ? 'active' : ''}`} onClick={() => setMode('register')}>회원가입</button>
          </div>
          <div className="input-group">
            <label>아이디</label>
            <input placeholder="아이디를 입력하세요" value={username} onChange={(e) => setUsername(e.target.value)} />
          </div>
          <div className="input-group">
            <label>비밀번호</label>
            <input type="password" placeholder="비밀번호를 입력하세요" value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAuth()} />
          </div>
          <button className="btn-primary" onClick={handleAuth}>
            {mode === 'login' ? '로그인' : '회원가입'}
          </button>
          {message && <p className="login-message">{message}</p>}
        </div>
      </div>
    );
  }

  // ── 메인 앱 ──
  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="app-header-title">보라매의 꿈</div>
      </header>

      <div className="tab-content">
        {message && <div className="toast">{message}</div>}

        {/* ── 홈 탭 ── */}
        {activeTab === 'home' && (
          <>
            <div className="card">
              <div className="card-title">🪖 내 복무 현황</div>
              <ProgressBar enlistmentDate={enlistmentDate} dischargeDate={dischargeDate} />
            </div>

            <div className="calendar-wrapper">
              <Calendar
                onChange={setSelectedDate}
                value={selectedDate}
                tileContent={({ date, view }) => {
                  if (view !== 'month') return null;
                  const key = formatDate(date);
                  return schedulesByDate[key]?.length > 0 ? <div className="tile-dot" /> : null;
                }}
              />
            </div>

            <div className="card">
              <div className="card-title">📅 {selectedDateString}</div>
              <div className="schedule-input-row">
                <input
                  placeholder="일정 추가"
                  value={scheduleText}
                  onChange={(e) => setScheduleText(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && addSchedule()}
                />
                <button className="btn-add" onClick={addSchedule}>추가</button>
              </div>
            </div>

            <div className="card">
              <div className="card-title">📋 일정 목록</div>
              {selectedSchedules.length === 0 ? (
                <p className="empty-text">등록된 일정이 없어요</p>
              ) : (
                <ul className="schedule-list">
                  {selectedSchedules.map((item) => (
                    <li key={item.id} className="schedule-item">
                      <span className="schedule-item-user">{item.username}</span>
                      {editingId === item.id ? (
                        <div className="schedule-edit-row">
                          <input
                            className="schedule-edit-input"
                            value={editingText}
                            onChange={(e) => setEditingText(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && updateSchedule(item.id)}
                            autoFocus
                          />
                          <button className="btn-confirm" onClick={() => updateSchedule(item.id)}>저장</button>
                          <button className="btn-cancel" onClick={() => setEditingId(null)}>취소</button>
                        </div>
                      ) : (
                        <div className="schedule-text-row">
                          <span className="schedule-item-text">{item.text}</span>
                          {(item.user_id || item.userId) === user.id && (
                            <div className="schedule-actions">
                              <button className="btn-icon" onClick={() => { setEditingId(item.id); setEditingText(item.text); }}>✏️</button>
                              <button className="btn-icon" onClick={() => deleteSchedule(item.id)}>🗑️</button>
                            </div>
                          )}
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
        )}

        {/* ── 친구 탭 ── */}
        {activeTab === 'friends' && (
          <>
            <div className="friend-sub-tabs">
              <button className={`friend-sub-tab ${friendTab === 'list' ? 'active' : ''}`} onClick={() => setFriendTab('list')}>친구</button>
              <button className={`friend-sub-tab ${friendTab === 'requests' ? 'active' : ''}`} onClick={() => { setFriendTab('requests'); loadFriendRequests(); }}>
                요청 {receivedCount > 0 && <span className="badge">{receivedCount}</span>}
              </button>
              <button className={`friend-sub-tab ${friendTab === 'search' ? 'active' : ''}`} onClick={() => setFriendTab('search')}>검색</button>
            </div>

            {friendTab === 'list' && (
              <div className="card">
                <div className="card-title">👥 내 친구 ({friends.length})</div>
                {friends.length === 0 ? (
                  <p className="empty-text">아직 친구가 없어요</p>
                ) : (
                  <ul className="user-list">
                    {friends.map((friend) => (
                      <li key={friend.id} className="user-item-col">
                        <span className="user-item-name">
                          <span className="avatar">{friend.username[0]}</span>
                          {friend.username}
                        </span>
                        <ProgressBar
                          enlistmentDate={friend.enlistment_date}
                          dischargeDate={friend.discharge_date}
                        />
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {friendTab === 'requests' && (
              <>
                <div className="card">
                  <div className="card-title">📩 받은 요청</div>
                  {friendRequests.received.length === 0 ? (
                    <p className="empty-text">받은 요청이 없어요</p>
                  ) : (
                    <ul className="user-list">
                      {friendRequests.received.map((req) => (
                        <li key={req.id} className="user-item">
                          <span className="user-item-name">
                            <span className="avatar">{req.fromUsername?.[0]}</span>
                            {req.fromUsername}
                          </span>
                          <div className="request-actions">
                            <button className="btn-accept" onClick={() => acceptRequest(req.id)}>수락</button>
                            <button className="btn-reject" onClick={() => rejectRequest(req.id)}>거절</button>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <div className="card">
                  <div className="card-title">📤 보낸 요청</div>
                  {friendRequests.sent.length === 0 ? (
                    <p className="empty-text">보낸 요청이 없어요</p>
                  ) : (
                    <ul className="user-list">
                      {friendRequests.sent.map((req) => (
                        <li key={req.id} className="user-item">
                          <span className="user-item-name">
                            <span className="avatar">{req.toUsername?.[0]}</span>
                            {req.toUsername}
                          </span>
                          <button className="btn-reject" onClick={() => cancelRequest(req.id)}>취소</button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </>
            )}

            {friendTab === 'search' && (
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
                        <button className="btn-friend-add" onClick={() => sendFriendRequest(item.id)}>
                          요청
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </>
        )}

        {/* ── 프로필 탭 ── */}
        {activeTab === 'profile' && (
          <>
            <div className="card profile-card">
              <div className="profile-avatar">{user.username[0]}</div>
              <div className="profile-name">{user.username}</div>
              <div className="profile-stats">
                <div className="stat">
                  <div className="stat-num">{friends.length}</div>
                  <div className="stat-label">친구</div>
                </div>
                <div className="stat">
                  <div className="stat-num">{schedules.filter(s => s.userId === user.id).length}</div>
                  <div className="stat-label">일정</div>
                </div>
              </div>
            </div>
            <div className="card">
              <div className="card-title">🪖 군 복무 정보</div>
              <ProgressBar enlistmentDate={enlistmentDate} dischargeDate={dischargeDate} />
              <div className="military-inputs">
                <div className="input-group" style={{ marginTop: 14 }}>
                  <label>입대일</label>
                  <input type="date" value={enlistmentDate} onChange={(e) => setEnlistmentDate(e.target.value)} />
                </div>
                <div className="input-group">
                  <label>전역일</label>
                  <input type="date" value={dischargeDate} onChange={(e) => setDischargeDate(e.target.value)} />
                </div>
                <button className="btn-primary" style={{ marginTop: 4 }} onClick={saveMilitaryDates}>
                  {militarySaved ? '저장됨 ✓' : '저장'}
                </button>
              </div>
            </div>
            <div className="card">
              <button className="btn-logout-full" onClick={logout}>로그아웃</button>
            </div>
          </>
        )}
      </div>

      {/* ── 하단 탭바 ── */}
      <nav className="bottom-nav">
        <button className={`nav-btn ${activeTab === 'home' ? 'active' : ''}`} onClick={() => setActiveTab('home')}>
          <span className="nav-icon">🏠</span>홈
        </button>
        <button className={`nav-btn ${activeTab === 'friends' ? 'active' : ''}`} onClick={() => setActiveTab('friends')}>
          <span className="nav-icon">👥</span>
          친구
          {receivedCount > 0 && <span className="nav-badge">{receivedCount}</span>}
        </button>
        <button className={`nav-btn ${activeTab === 'profile' ? 'active' : ''}`} onClick={() => setActiveTab('profile')}>
          <span className="nav-icon">👤</span>프로필
        </button>
      </nav>
    </div>
  );
}

export default App;
