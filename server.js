const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

let schedules = [];

// 일정 추가
app.post('/schedule', (req, res) => {
  const { date, text } = req.body;
  const schedule = { date, text };
  schedules.push(schedule);
  res.json(schedule);
});

// 일정 조회
app.get('/schedule', (req, res) => {
  res.json(schedules);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('Server running'));
app.get("/", (req, res) => {
  res.send("Server is working!");
});