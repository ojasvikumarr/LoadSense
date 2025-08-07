# AI-Augmented Load Balancer

A distributed system for intelligent traffic routing with the following components:

- Node.js Express load balancer
- Two backend server nodes
- Python ML prediction service
- Traffic simulation tool

## Structure

```
./
├── load_balancer/       # Express load balancer
├── backend_servers/     # Backend servers
├── ml_module/           # ML prediction service
└── traffic_simulator/   # Traffic generator
```

## Quick Start

Use the launch script to set up and start all services:

```bash
# On macOS/Linux:
chmod +x launch.sh
./launch.sh

# On Windows:
launch.bat
```

After services are running, run the traffic simulator:

```bash
cd traffic_simulator
node simulator.js

# Customize traffic pattern (optional):
node simulator.js --pattern sine_wave --duration 30 --min 10 --max 100
```

## Manual Setup

For individual components:

```bash
# Load Balancer
cd load_balancer && npm install && node server.js

# Backend Servers
cd backend_servers && npm install && node server_manager.js

# ML Module
cd ml_module && pip install -r requirements.txt && python app.py

# Traffic Simulator
cd traffic_simulator && npm install && node simulator.js
```

## Technical Overview

- Load balancer dynamically routes traffic based on ML predictions
- Traffic metrics collected at 5-minute intervals
- Linear regression model for time-series prediction
- Multiple traffic patterns available for simulation
- Distributed design with REST API communication
# LoadSense
