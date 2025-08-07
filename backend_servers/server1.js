const express = require('express');
const app = express();

app.use(express.json());

const PORT = 3001;
const SERVER_ID = 'server1';

// Simulate processing delay
const processRequest = (req, res, next) => {
  const processingTime = Math.floor(Math.random() * 100) + 50; // 50-150ms
  setTimeout(next, processingTime);
};

app.use(processRequest);

// API endpoints
app.get('/api/data', (req, res) => {
  res.json({ 
    server: SERVER_ID,
    message: 'Data retrieved successfully',
    timestamp: new Date().toISOString(),
    data: { 
      values: Array.from({length: 5}, () => Math.floor(Math.random() * 100))
    }
  });
});

app.post('/api/data', (req, res) => {
  res.json({
    server: SERVER_ID,
    message: 'Data processed successfully',
    timestamp: new Date().toISOString(),
    receivedData: req.body
  });
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'healthy', server: SERVER_ID });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    server: SERVER_ID,
    error: 'Internal server error',
    message: err.message
  });
});

app.listen(PORT, () => {
  console.log(`Backend ${SERVER_ID} running on port ${PORT}`);
});
