import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import Calendar from 'react-calendar';
import 'react-calendar/dist/Calendar.css';
import './App.css';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

const SCHEDULE_TYPES = [
  { key: '성과제', char: '성', color: '#2563EB', bg: '#DBEAFE' },
  { key: '연가',   char: '연', color: '#16A34A', bg: '#DCFCE7' },
  { key: '포상휴가', char: '포', color: '#7C3AED', bg: '#EDE9FE' },
  { key: '위로휴가', char: '위', color: '#DC2626', bg: '#FEE2E2' },
  { key: '기타휴가', char: '기', color: '#EA580C', bg: '#FFEDD5' },
  { key: '외출',   char: '외', color: '#0891B2', bg: '#CFFAFE' },
];

function getTypeInfo(key) {
  return SCHEDULE_TYPES.find(t => t.key === key) || null;
}

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

// 표시 이름 우선순위: 내가 설정한 별명 > 상대 이름 > 아이디
function displayName(f) {
  return f.nickname || f.name || f.username;
}

function App() {
  const [mode, setMode] = useState('login');
  const [username, setUsername] = useState('');
  const [registerName, setRegisterName] = useState('');
  const [password, setPassword] = useState('');
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(localStorage.getItem('token') || '');
  const [activeTab, setActiveTab] = useState('home');

  // 홈 탭
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [scheduleType, setScheduleType] = useState('성과제');
  const [customType, setCustomType] = useState('');
  const [schedules, setSchedules] = useState([]);
  const [editingId, setEditingId] = useState(null);
  const [editingType, setEditingType] = useState('성과제');
  const [editingCustomType, setEditingCustomType] = useState('');

  // 친구 탭
  const [searchKeyword, setSearchKeyword] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [friends, setFriends] = useState([]);
  const [friendRequests, setFriendRequests] = useState({ received: [], sent: [] });
  const [friendTab, setFriendTab] = useState('list');
  // 친구 별명 편집
  const [editingNicknameId, setEditingNicknameId] = useState(null);
  const [nicknameInput, setNicknameInput] = useState('');

  // 군 복무
  const [enlistmentDate, setEnlistmentDate] = useState('');
  const [dischargeDate, setDischargeDate] = useState('');
  const [militarySaved, setMilitarySaved] = useState(false);

  // 친구 캘린더
  const [viewingFriend, setViewingFriend] = useState(null);
  const [friendCalDate, setFriendCalDate] = useState(new Date());

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
    // DB가 "2026-04-20T00:00:00.000Z" 형태로 줄 때도 안전하게 처리
    const dateKey = item.date ? String(item.date).slice(0, 10) : null;
    if (!dateKey) return acc;
    if (!acc[dateKey]) acc[dateKey] = [];
    acc[dateKey].push(item);
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
      const payload = mode === 'register'
        ? { username, password, name: registerName }
        : { username, password };
      const res = await axios.post(`${API_BASE_URL}${endpoint}`, payload);
      localStorage.setItem('token', res.data.token);
      localStorage.setItem('user', JSON.stringify(res.data.user));
      setToken(res.data.token);
      setUser(res.data.user);
    } catch (error) {
      showMessage(error.response?.data?.message || '요청 실패');
    }
  }

  async function saveFriendNickname(friendId) {
    try {
      const val = nicknameInput.trim();
      if (val) {
        await axios.put(`${API_BASE_URL}/friends/${friendId}/nickname`, { nickname: val }, authHeaders);
      } else {
        await axios.delete(`${API_BASE_URL}/friends/${friendId}/nickname`, authHeaders);
      }
      setEditingNicknameId(null);
      setNicknameInput('');
      loadFriends();
    } catch {
      showMessage('별명 저장 실패');
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
    if (scheduleType === '기타휴가' && !customType.trim()) {
      showMessage('휴가 종류를 입력하세요.'); return;
    }
    const payload = {
      date: selectedDateString,
      scheduleType,
      customType: scheduleType === '기타휴가' ? customType.trim() : '',
      text: scheduleType === '기타휴가' ? (customType.trim() || '기타휴가') : scheduleType,
    };
    try {
      await axios.post(`${API_BASE_URL}/schedules`, payload, authHeaders);
      setCustomType('');
      loadSchedules();
    } catch (error) {
      showMessage(error.response?.data?.message || '일정 추가 실패');
    }
  }

  async function updateSchedule(id) {
    if (editingType === '기타휴가' && !editingCustomType.trim()) {
      showMessage('휴가 종류를 입력하세요.'); return;
    }
    const payload = {
      scheduleType: editingType,
      customType: editingType === '기타휴가' ? editingCustomType.trim() : '',
      text: editingType === '기타휴가' ? (editingCustomType.trim() || '기타휴가') : editingType,
    };
    try {
      await axios.put(`${API_BASE_URL}/schedules/${id}`, payload, authHeaders);
      setEditingId(null);
      setEditingType('성과제');
      setEditingCustomType('');
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
            <input placeholder="로그인에 사용할 아이디" value={username} onChange={(e) => setUsername(e.target.value)} />
          </div>
          {mode === 'register' && (
            <div className="input-group">
              <label>이름 <span className="label-hint">(친구에게 표시될 이름)</span></label>
              <input placeholder="홍길동" value={registerName} onChange={(e) => setRegisterName(e.target.value)} />
            </div>
          )}
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

        {/* 제작자 소개 */}
        <div className="dev-card">
          <p className="dev-title">Who is millioncozy?</p>
          <p className="dev-line">B.S. candidate · Univ. of Seoul</p>
          <p className="dev-line">Electrical &amp; Computer Engineering</p>
          <div className="dev-links">
            <a className="dev-link" href="https://github.com/millioncozy" target="_blank" rel="noreferrer">
              github.com/millioncozy
            </a>
            <span className="dev-sep">·</span>
            <span className="dev-link">2 projects</span>
          </div>
          <a className="dev-contact" href="mailto:limmy09@naver.com">
            ✉ limmy09@naver.com
          </a>
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
                  const dayItems = schedulesByDate[key];
                  if (!dayItems?.length) return null;
                  const myItems = dayItems.filter(s =>
                    String(s.user_id ?? s.userId) === String(user?.id)
                  );
                  if (!myItems.length) return null;
                  const first = myItems[0];
                  const info = getTypeInfo(first.schedule_type);
                  if (!info) return null;
                  return (
                    /* 인라인 스타일로 배경색 직접 주입 — CSS 우선순위 문제 없음 */
                    <div
                      className="tile-overlay"
                      style={{ background: info.bg }}
                    >
                      <span className="tile-overlay-char" style={{ color: info.color }}>
                        {info.char}
                      </span>
                      {myItems.length > 1 && (
                        <span className="tile-overlay-count">+{myItems.length - 1}</span>
                      )}
                    </div>
                  );
                }}
              />
            </div>

            <div className="card">
              <div className="card-title">📅 {selectedDateString} 일정 추가</div>
              <div className="schedule-type-grid">
                {SCHEDULE_TYPES.map(t => (
                  <button
                    key={t.key}
                    className={`type-btn ${scheduleType === t.key ? 'active' : ''}`}
                    style={{ '--tc': t.color, '--tb': t.bg }}
                    onClick={() => setScheduleType(t.key)}
                  >
                    <span className="type-btn-char">{t.char}</span>
                    <span className="type-btn-label">{t.key}</span>
                  </button>
                ))}
              </div>
              {scheduleType === '기타휴가' && (
                <div className="custom-type-row">
                  <input
                    className="custom-type-input"
                    placeholder="휴가 종류 입력 (예: 병가, 청원휴가)"
                    value={customType}
                    onChange={e => setCustomType(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && addSchedule()}
                  />
                </div>
              )}
              <button className="btn-primary mt-8" onClick={addSchedule}>등록</button>
            </div>

            <div className="card">
              <div className="card-title">📋 일정 목록</div>
              {selectedSchedules.length === 0 ? (
                <p className="empty-text">등록된 일정이 없어요</p>
              ) : (
                <ul className="schedule-list">
                  {selectedSchedules.map((item) => {
                    const info = getTypeInfo(item.schedule_type);
                    const label = item.schedule_type === '기타휴가' && item.custom_type
                      ? item.custom_type
                      : (item.schedule_type || item.text);
                    return (
                      <li key={item.id} className="schedule-item">
                        <span className="schedule-item-user">{item.username}</span>
                        {editingId === item.id ? (
                          <div className="schedule-edit-type">
                            <div className="schedule-type-grid small">
                              {SCHEDULE_TYPES.map(t => (
                                <button
                                  key={t.key}
                                  className={`type-btn small ${editingType === t.key ? 'active' : ''}`}
                                  style={{ '--tc': t.color, '--tb': t.bg }}
                                  onClick={() => setEditingType(t.key)}
                                >
                                  <span className="type-btn-char">{t.char}</span>
                                  <span className="type-btn-label">{t.key}</span>
                                </button>
                              ))}
                            </div>
                            {editingType === '기타휴가' && (
                              <input
                                className="custom-type-input mt-8"
                                placeholder="휴가 종류"
                                value={editingCustomType}
                                onChange={e => setEditingCustomType(e.target.value)}
                                autoFocus
                              />
                            )}
                            <div className="edit-action-row">
                              <button className="btn-confirm" onClick={() => updateSchedule(item.id)}>저장</button>
                              <button className="btn-cancel" onClick={() => setEditingId(null)}>취소</button>
                            </div>
                          </div>
                        ) : (
                          <div className="schedule-text-row">
                            {info ? (
                              <span className="schedule-type-badge" style={{ color: info.color, background: info.bg }}>
                                <span className="badge-char">{info.char}</span>
                                <span className="badge-label">{label}</span>
                              </span>
                            ) : (
                              <span className="schedule-item-text">{item.text}</span>
                            )}
                            {(item.user_id || item.userId) === user.id && (
                              <div className="schedule-actions">
                                <button className="btn-icon" onClick={() => {
                                  setEditingId(item.id);
                                  setEditingType(item.schedule_type || '성과제');
                                  setEditingCustomType(item.custom_type || '');
                                }}>✏️</button>
                                <button className="btn-icon" onClick={() => deleteSchedule(item.id)}>🗑️</button>
                              </div>
                            )}
                          </div>
                        )}
                      </li>
                    );
                  })}
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
                    {friends.map((friend) => {
                      const dName = displayName(friend);
                      const isEditingNickname = editingNicknameId === friend.id;
                      return (
                        <li key={friend.id} className="user-item-col">
                          <div className="user-item-row">
                            <span className="user-item-name">
                              <span className="avatar">{dName[0]}</span>
                              <span>
                                <span className="friend-display-name">{dName}</span>
                                {friend.nickname && (
                                  <span className="friend-real-name">({friend.name || friend.username})</span>
                                )}
                                <span className="friend-uid">@{friend.username}</span>
                              </span>
                            </span>
                            <div className="friend-actions">
                              <button
                                className="btn-nickname-edit"
                                title="별명 설정"
                                onClick={() => {
                                  setEditingNicknameId(friend.id);
                                  setNicknameInput(friend.nickname || '');
                                }}
                              >✏️</button>
                              <button className="btn-view-cal" onClick={() => { setViewingFriend(friend); setFriendCalDate(new Date()); }}>
                                📅
                              </button>
                            </div>
                          </div>
                          {/* 별명 편집 인라인 UI */}
                          {isEditingNickname && (
                            <div className="nickname-edit-row">
                              <input
                                className="nickname-input"
                                placeholder="별명 입력 (비우면 삭제)"
                                value={nicknameInput}
                                onChange={(e) => setNicknameInput(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && saveFriendNickname(friend.id)}
                                autoFocus
                              />
                              <button className="btn-nickname-save" onClick={() => saveFriendNickname(friend.id)}>저장</button>
                              <button className="btn-nickname-cancel" onClick={() => setEditingNicknameId(null)}>취소</button>
                            </div>
                          )}
                          <ProgressBar
                            enlistmentDate={friend.enlistment_date}
                            dischargeDate={friend.discharge_date}
                          />
                        </li>
                      );
                    })}
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
                            <span className="avatar">{(req.fromName || req.fromUsername)?.[0]}</span>
                            <span>
                              <span className="friend-display-name">{req.fromName || req.fromUsername}</span>
                              <span className="friend-uid">@{req.fromUsername}</span>
                            </span>
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
                            <span className="avatar">{(req.toName || req.toUsername)?.[0]}</span>
                            <span>
                              <span className="friend-display-name">{req.toName || req.toUsername}</span>
                              <span className="friend-uid">@{req.toUsername}</span>
                            </span>
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
                          <span className="avatar">{(item.name || item.username)[0]}</span>
                          <span>
                            <span className="friend-display-name">{item.name || item.username}</span>
                            <span className="friend-uid">@{item.username}</span>
                          </span>
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
              <div className="profile-avatar">{(user.name || user.username)[0]}</div>
              <div className="profile-name">{user.name || user.username}</div>
              <div className="profile-username">@{user.username}</div>
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

      {/* ── 친구 캘린더 오버레이 ── */}
      {viewingFriend && (() => {
        // String 변환으로 타입 불일치(숫자 vs 문자) 방지
        const friendSchedules = schedules.filter(s =>
          String(s.user_id ?? s.userId) === String(viewingFriend.id)
        );
        // 날짜 키 정규화 — DB가 "2026-06-06T00:00:00.000Z"로 줄 때도 안전하게
        const byDate = friendSchedules.reduce((acc, s) => {
          const key = s.date ? String(s.date).slice(0, 10) : null;
          if (!key) return acc;
          if (!acc[key]) acc[key] = [];
          acc[key].push(s);
          return acc;
        }, {});
        const selectedKey = formatDate(friendCalDate);
        const daySchedules = byDate[selectedKey] || [];

        return (
          <div className="friend-cal-overlay">
            <div className="friend-cal-header">
              <button className="btn-back" onClick={() => setViewingFriend(null)}>← 뒤로</button>
              <span className="friend-cal-title">{displayName(viewingFriend)}의 캘린더</span>
            </div>
            <div className="friend-cal-body">
              <div className="calendar-wrapper">
                <Calendar
                  onChange={setFriendCalDate}
                  value={friendCalDate}
                  tileContent={({ date, view }) => {
                    if (view !== 'month') return null;
                    const key = formatDate(date);
                    const items = byDate[key];
                    if (!items?.length) return null;
                    const first = items[0];
                    const info = getTypeInfo(first.schedule_type);
                    if (!info) return null;
                    // 메인 캘린더와 동일한 오버레이 방식 적용
                    return (
                      <div
                        className="tile-overlay"
                        style={{ background: info.bg }}
                      >
                        <span className="tile-overlay-char" style={{ color: info.color }}>
                          {info.char}
                        </span>
                        {items.length > 1 && (
                          <span className="tile-overlay-count">+{items.length - 1}</span>
                        )}
                      </div>
                    );
                  }}
                />
              </div>
              <div className="card">
                <div className="card-title">📋 {selectedKey} 일정</div>
                {daySchedules.length === 0 ? (
                  <p className="empty-text">이 날짜에 일정이 없어요</p>
                ) : (
                  <ul className="schedule-list">
                    {daySchedules.map(s => {
                      const info = getTypeInfo(s.schedule_type);
                      return (
                        <li key={s.id} className="schedule-item">
                          {info && (
                            <span
                              className="schedule-type-badge"
                              style={{ background: info.bg, color: info.color }}
                            >
                              {s.schedule_type === '기타휴가' && s.custom_type
                                ? s.custom_type
                                : s.schedule_type}
                            </span>
                          )}
                          <span className="schedule-item-text">{s.text}</span>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </div>
          </div>
        );
      })()}

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
