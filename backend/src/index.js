const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 8080;
const AI_SERVICE_URL = process.env.AI_SERVICE_URL || 'http://localhost:8000';

// Enable JSON body parsing
app.use(express.json());

// Local development CORS configuration
app.use(
  cors({
    origin: 'http://localhost:5173',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    credentials: true,
  })
);

// Root health check endpoint
app.get('/', (req, res) => {
  res.json({ message: 'PRism backend is running' });
});

// Proxy health check to AI service (FastAPI)
app.get('/api/ai-health', async (req, res) => {
  try {
    const response = await fetch(`${AI_SERVICE_URL}/`);
    if (!response.ok) {
      return res.status(response.status).json({
        error: `AI service returned status ${response.status}`,
      });
    }
    const data = await response.json();
    return res.json(data);
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
