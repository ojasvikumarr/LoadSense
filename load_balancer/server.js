const express = require('express');
const axios = require('axios');
const winston = require('winston');
const schedule = require('node-schedule');
const dotenv = require('dotenv');
const fs = require('fs');
const path = require('path');

dotenv.config();

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const ML_SERVICE_URL = process.env.ML_SERVICE_URL || 'http://localhost:5000';
const BACKEND_SERVERS = [
  process.env.BACKEND_SERVER_1 || 'http://localhost:3001',
  process.env.BACKEND_SERVER_2 || 'http://localhost:3002'
];

// configuring logger
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: 'logs/traffic.log' })
  ]
});

// ensuring logs directory exists
const logDir = path.join(__dirname, 'logs');
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir);
}

const trafficHistory = {
  timestamps: [],
  requestCounts: []
};

let currentServerIndex = 0;
let predictedLoad = 0;

// store request counts in 5-minute intervals
function recordTraffic() {
  const timestamp = new Date().toISOString();
  trafficHistory.timestamps.push(timestamp);
  trafficHistory.requestCounts.push(requestCount);
  
  // keep only last 24 hours of data 
  if (trafficHistory.timestamps.length > 288) {
    trafficHistory.timestamps.shift();
    trafficHistory.requestCounts.shift();
  }
  
  logger.info(`Traffic recorded: ${requestCount} requests in the last interval`);
  requestCount = 0;
}

let requestCount = 0;

// schedule traffic recording every 5 minutes
schedule.scheduleJob('*/5 * * * *', recordTraffic);

// schedule ML prediction request every 10 minutes
schedule.scheduleJob('*/10 * * * *', async () => {
  try {
    const response = await axios.post(`${ML_SERVICE_URL}/predict`, {
      timestamps: trafficHistory.timestamps,
      requestCounts: trafficHistory.requestCounts
    });
    
    predictedLoad = response.data.predictedLoad;
    logger.info(`ML prediction received: ${predictedLoad}`);
    
    // adjust routing strategy based on predicted load
    adjustRoutingStrategy(predictedLoad);
  } catch (error) {
    logger.error(`Error getting prediction: ${error.message}`);
  }
});

// adjust routing strategy based on predicted load
function adjustRoutingStrategy(predictedLoad) {
  if (predictedLoad > 50) {
    //high load, use round robin to distribute traffic
    currentServerIndex = (currentServerIndex + 1) % BACKEND_SERVERS.length;
  } else {
    // low load, stick with server 1
    currentServerIndex = 0;
  }
}

// load balancer middleware
app.use(async (req, res) => {
  requestCount++;
  
  try {
    const targetServer = BACKEND_SERVERS[currentServerIndex];
    
    // forwarding the request to the selected backend server
    const response = await axios({
      method: req.method,
      url: `${targetServer}${req.url}`,
      headers: { ...req.headers, host: new URL(targetServer).host },
      data: req.body,
      validateStatus: () => true  
    });
    
    logger.info({
      method: req.method,
      path: req.url,
      serverIndex: currentServerIndex,
      status: response.status,
      predictedLoad
    });
    
    res.status(response.status).send(response.data);
    
    // Simple round robin for next request
    if (predictedLoad <= 50) {
      currentServerIndex = (currentServerIndex + 1) % BACKEND_SERVERS.length;
    }
  } catch (error) {
    logger.error(`Error forwarding request: ${error.message}`);
    res.status(500).send('Load balancer error');
  }
});

app.get('/health', (req, res) => {
  res.status(200).send('Load balancer is running');
});

app.listen(PORT, () => {
  console.log(`Load balancer running on port ${PORT}`);
});
