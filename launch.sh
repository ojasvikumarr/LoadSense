#!/bin/bash

# Function to print status messages
log() {
  GREEN='\033[0;32m'
  BLUE='\033[0;34m'
  NC='\033[0m'
  
  echo -e "${GREEN}[$(date +%H:%M:%S)]${NC} ${BLUE}$1${NC}"
}

setup_env_files() {
  log "Setting up environment files"
  
  if [ ! -f "./load_balancer/.env" ]; then
    cat > ./load_balancer/.env << EOF
PORT=3000
ML_SERVICE_URL=http://localhost:5000
BACKEND_SERVER_1=http://localhost:3001
BACKEND_SERVER_2=http://localhost:3002
EOF
  fi
  
  if [ ! -f "./traffic_simulator/.env" ]; then
    cat > ./traffic_simulator/.env << EOF
LOAD_BALANCER_URL=http://localhost:3000
MIN_REQUESTS_PER_MINUTE=5
MAX_REQUESTS_PER_MINUTE=50
SIMULATION_DURATION_MINUTES=60
EOF
  fi
}

setup_dirs() {
  log "Creating necessary directories"
  mkdir -p ./load_balancer/logs
  mkdir -p ./ml_module/logs
  mkdir -p ./traffic_simulator/logs
}

install_deps() {
  log "Installing dependencies"
  
  log "Load balancer dependencies"
  cd ./load_balancer && npm install --no-fund --no-audit
  cd ..
  
  log "Backend server dependencies" 
  cd ./backend_servers && npm install --no-fund --no-audit
  cd ..
  
  log "Traffic simulator dependencies"
  cd ./traffic_simulator && npm install --no-fund --no-audit
  cd ..
  
  log "ML module dependencies"
  cd ./ml_module && pip install -r requirements.txt
  cd ..
}

start_services() {
  log "Starting services"
  
  # ML service first
  log "Starting ML service"
  osascript -e 'tell app "Terminal" to do script "cd '$PWD'/ml_module && python app.py"'
  sleep 3
  
  # Backend servers
  log "Starting backend servers"
  osascript -e 'tell app "Terminal" to do script "cd '$PWD'/backend_servers && node server_manager.js"'
  sleep 2
  
  # Load balancer last
  log "Starting load balancer"
  osascript -e 'tell app "Terminal" to do script "cd '$PWD'/load_balancer && node server.js"'
  sleep 2
  
  log "All services running"
}

# Main execution
setup_env_files
setup_dirs
install_deps
start_services

echo ""
log "Traffic simulator usage:"
echo "  cd ./traffic_simulator && node simulator.js"
echo "  node simulator.js --pattern sine_wave --duration 30"
echo ""
log "System is ready"
