require('dotenv').config();
const express = require('express');
const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: false }));

app.get('/', (req, res) => {
  res.json({ status: 'Sydia AI Agent Running', version: '1.0.0' });
});

app.use('/webhook', require('./webhook'));

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Sydia AI Agent running on port ${PORT}`);
});