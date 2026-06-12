require('dotenv').config();
const express = require('express');
const session = require('express-session');
const axios = require('axios');
const path = require('path');

const app = express();

const {
  MS_CLIENT_ID,
  MS_CLIENT_SECRET,
  MS_REDIRECT_URI,
  SESSION_SECRET,
  PORT = 3000,
} = process.env;

app.use(session({
  secret: SESSION_SECRET || 'dev-secret-change-me',
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: 'lax' },
}));

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

app.get('/api/auth/login', (req, res) => {
  const param
