const axios = require('axios');
const { Worker, isMainThread, parentPort, workerData } = require('worker_threads');
const moment = require('moment');
const { program } = require('commander');
const dotenv = require('dotenv');
const path = require('path');
const fs = require('fs');

dotenv.config();


const LOAD_BALANCER_URL = process.env.LOAD_BALANCER_URL || 'http://localhost:3000';
const MIN_REQUESTS_PER_MINUTE = parseInt(process.env.MIN_REQUESTS_PER_MINUTE || '5');
const MAX_REQUESTS_PER_MINUTE = parseInt(process.env.MAX_REQUESTS_PER_MINUTE || '50');
const SIMULATION_DURATION_MINUTES = parseInt(process.env.SIMULATION_DURATION_MINUTES || '60');


const TRAFFIC_PATTERNS = {
  constant: (minute) => 0.5, // 50% of max traffic constantly
  linear_increase: (minute, duration) => Math.min(1, minute / (duration * 0.8)), // Linear ramp up
  linear_decrease: (minute, duration) => Math.max(0, 1 - (minute / (duration * 0.8))), // Linear ramp down
  sine_wave: (minute, duration) => 0.5 + 0.4 * Math.sin((minute / duration) * 2 * Math.PI), 
  random: () => Math.random(), 
  spike: (minute, duration) => {

    if (minute % 10 === 0) return 1;
    return 0.3;
  }
};

program
  .option('-d, --duration <minutes>', 'Simulation duration in minutes', SIMULATION_DURATION_MINUTES)
  .option('-p, --pattern <pattern>', 'Traffic pattern (constant, linear_increase, linear_decrease, sine_wave, random, spike)', 'sine_wave')
  .option('-m, --min <requests>', 'Minimum requests per minute', MIN_REQUESTS_PER_MINUTE)
  .option('-x, --max <requests>', 'Maximum requests per minute', MAX_REQUESTS_PER_MINUTE)
  .parse(process.argv);

const options = program.opts();

if (!isMainThread) {
  const { url, payload, requestId } = workerData;
  
  async function sendRequest() {
    try {
      const startTime = Date.now();
      const response = await axios.post(url, payload);
      const endTime = Date.now();
      
      parentPort.postMessage({ 
        success: true, 
        requestId, 
        duration: endTime - startTime,
        statusCode: response.status,
        server: response.data.server || 'unknown'
      });
    } catch (error) {
      parentPort.postMessage({ 
        success: false, 
        requestId,
        error: error.message
      });
    }
  }
  
  sendRequest();
} else {
  class TrafficSimulator {
    constructor(options) {
      this.loadBalancerUrl = LOAD_BALANCER_URL;
      this.minRequestsPerMinute = parseInt(options.min);
      this.maxRequestsPerMinute = parseInt(options.max);
      this.simulationDurationMinutes = parseInt(options.duration);
      this.pattern = options.pattern;
      this.requestCounter = 0;
      this.startTime = Date.now();
      this.workers = [];
      this.results = {
        totalRequests: 0,
        successfulRequests: 0,
        failedRequests: 0,
        responseTimes: [],
        serverDistribution: {}
      };
      
      this.ensureLogDir();
    }
    
    ensureLogDir() {
      const logDir = path.join(__dirname, 'logs');
      if (!fs.existsSync(logDir)) {
        fs.mkdirSync(logDir);
      }
    }
    
    getCurrentMinute() {
      return Math.floor((Date.now() - this.startTime) / (1000 * 60));
    }
    
    calculateTrafficLevel() {
      const currentMinute = this.getCurrentMinute();
      const pattern = TRAFFIC_PATTERNS[this.pattern] || TRAFFIC_PATTERNS.constant;
      return pattern(currentMinute, this.simulationDurationMinutes);
    }
    
    calculateRequestsThisMinute() {
      const trafficLevel = this.calculateTrafficLevel();
      const requestsRange = this.maxRequestsPerMinute - this.minRequestsPerMinute;
      return Math.floor(this.minRequestsPerMinute + (requestsRange * trafficLevel));
    }
    
    sendRequest() {
      const requestId = ++this.requestCounter;
      const payload = {
        id: requestId,
        timestamp: new Date().toISOString(),
        data: {
          value: Math.floor(Math.random() * 100),
          text: `Request ${requestId} data`
        }
      };
      
      const endpoint = Math.random() > 0.5 ? '/api/data' : '/api/data';
      const url = `${this.loadBalancerUrl}${endpoint}`;
      
      const worker = new Worker(__filename, {
        workerData: { url, payload, requestId }
      });
      
      worker.on('message', (message) => {
        this.handleResponse(message);
      });
      
      worker.on('error', (err) => {
        console.error(`Worker error for request ${requestId}:`, err);
        this.results.failedRequests++;
      });
      
      worker.on('exit', (code) => {
        this.workers = this.workers.filter(w => w !== worker);
        if (code !== 0) {
          console.error(`Worker stopped with exit code ${code}`);
        }
      });
      
      this.workers.push(worker);
    }
    
    handleResponse(message) {
      this.results.totalRequests++;
      
      if (message.success) {
        this.results.successfulRequests++;
        this.results.responseTimes.push(message.duration);
        
        // Track server distribution
        const server = message.server;
        if (!this.results.serverDistribution[server]) {
          this.results.serverDistribution[server] = 0;
        }
        this.results.serverDistribution[server]++;
      } else {
        this.results.failedRequests++;
      }
      
      if (this.results.totalRequests % 50 === 0) {
        this.logCurrentStats();
      }
    }
    
    logCurrentStats() {
      const avgResponseTime = this.results.responseTimes.length > 0 
        ? this.results.responseTimes.reduce((sum, time) => sum + time, 0) / this.results.responseTimes.length 
        : 0;
      
      console.log(`
Time elapsed: ${moment.duration(Date.now() - this.startTime).humanize()}
Total requests: ${this.results.totalRequests}
Successful: ${this.results.successfulRequests}
Failed: ${this.results.failedRequests}
Average response time: ${avgResponseTime.toFixed(2)}ms
Server distribution: ${JSON.stringify(this.results.serverDistribution)}
      `);
      
      const logEntry = {
        timestamp: new Date().toISOString(),
        elapsed: Date.now() - this.startTime,
        totalRequests: this.results.totalRequests,
        successful: this.results.successfulRequests,
        failed: this.results.failedRequests,
        avgResponseTime: avgResponseTime,
        serverDistribution: this.results.serverDistribution,
        pattern: this.pattern,
        trafficLevel: this.calculateTrafficLevel()
      };
      
      fs.appendFileSync(
        path.join(__dirname, 'logs', `simulation_${this.startTime}.json`), 
        JSON.stringify(logEntry) + '\n'
      );
    }
    
    async simulateTraffic() {
      console.log(`
Starting traffic simulation with the following parameters:
- Load balancer URL: ${this.loadBalancerUrl}
- Duration: ${this.simulationDurationMinutes} minutes
- Pattern: ${this.pattern}
- Min requests per minute: ${this.minRequestsPerMinute}
- Max requests per minute: ${this.maxRequestsPerMinute}
      `);
      
      // initialize simulation timer
      this.startTime = Date.now();
      let lastMinute = -1;
      
      return new Promise((resolve) => {
        // set up interval to check and send appropriate number of requests
        const interval = setInterval(() => {
          const currentMinute = this.getCurrentMinute();
          
          // if we've gone past the duration, stop the simulation
          if (currentMinute >= this.simulationDurationMinutes) {
            clearInterval(interval);
            
            // wait for all workers to complete
            if (this.workers.length === 0) {
              this.logCurrentStats();
              console.log('Simulation completed!');
              resolve(this.results);
            } else {
              console.log(`Waiting for ${this.workers.length} outstanding requests to complete...`);
              setTimeout(() => {
                resolve(this.results);
              }, 5000); // give up to 5 seconds for remaining workers
            }
            return;
          }
          
          if (currentMinute !== lastMinute) {
            lastMinute = currentMinute;
            const requestsThisMinute = this.calculateRequestsThisMinute();
            console.log(`Minute ${currentMinute + 1}/${this.simulationDurationMinutes}: Sending ~${requestsThisMinute} requests (${this.calculateTrafficLevel().toFixed(2) * 100}% traffic level)`);
            
            const intervalMs = 60000 / requestsThisMinute;
            
            for (let i = 0; i < requestsThisMinute; i++) {
              setTimeout(() => {
                this.sendRequest();
              }, i * intervalMs);
            }
          }
        }, 1000); 
      });
    }
  }
  
  async function main() {
    const simulator = new TrafficSimulator(options);
    await simulator.simulateTraffic();
    process.exit(0);
  }
  
  main().catch(err => {
    console.error('Simulation error:', err);
    process.exit(1);
  });
}
