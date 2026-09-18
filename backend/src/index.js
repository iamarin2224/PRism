const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const { handleGitHubWebhook } = require('./webhook');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 8080;
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';
const AI_SERVICE_URL = process.env.AI_SERVICE_URL || 'http://localhost:8000';

// Enable JSON body parsing while preserving raw body for HMAC signature verification
app.use(
  express.json({
    verify: (req, res, buf) => {
      req.rawBody = buf;
    },
  })
);

// Local development CORS configuration
app.use(
  cors({
    origin: FRONTEND_URL,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    credentials: true,
  })
);

// Root health check endpoint
app.get('/', (req, res) => {
  res.json({ message: 'PRism backend is running' });
});

// GitHub Webhook endpoint
app.post('/api/github/webhook', (req, res) => {
  return handleGitHubWebhook(req, res, AI_SERVICE_URL);
});

// Proxy health check to AI service (FastAPI)
app.get('/api/ai-health', async (req, res) => {
  try {
    const response = await fetch(`${AI_SERVICE_URL}/`);
    const data = await response.json();
    return res.status(response.status).json(data);
  } catch (error) {
    return res.status(502).json({
      error: 'Failed to communicate with AI service',
      details: error.message,
    });
  }
});

// Proxy basic LLM test to FastAPI
app.post('/api/ai/test', async (req, res) => {
  try {
    const response = await fetch(`${AI_SERVICE_URL}/api/ai/test`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body),
    });
    const data = await response.json();
    return res.status(response.status).json(data);
  } catch (error) {
    return res.status(502).json({
      error: 'Failed to communicate with AI service',
      details: error.message,
    });
  }
});

// Proxy structured output test to FastAPI
app.post('/api/ai/test-structured', async (req, res) => {
  try {
    const response = await fetch(`${AI_SERVICE_URL}/api/ai/test-structured`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body || {}),
    });
    const data = await response.json();
    return res.status(response.status).json(data);
  } catch (error) {
    return res.status(502).json({
      error: 'Failed to communicate with AI service',
      details: error.message,
    });
  }
});

app.listen(PORT, () => {
  console.log(`PRism backend listening on port ${PORT}`);
});
