from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import List
import pandas as pd
import numpy as np
from sklearn.linear_model import LinearRegression
from sklearn.preprocessing import StandardScaler
import datetime
import joblib
import os
import logging
from threading import Lock

# configuring logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler("ml_service.log"),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger("ml_service")

# creating FastAPI app
app = FastAPI(title="Traffic Prediction API")

# request models
class TrafficData(BaseModel):
    timestamps: List[str]
    requestCounts: List[int]

# response models
class PredictionResponse(BaseModel):
    predictedLoad: float
    confidence: float
    nextTimestamp: str

model_lock = Lock()
model_path = "model.joblib"
scaler_path = "scaler.joblib"
model = None
scaler = None


def extract_time_features(timestamps):
    features = []
    for timestamp in timestamps:
        dt = datetime.datetime.fromisoformat(timestamp.replace('Z', '+00:00'))
        hour = dt.hour
        minute = dt.minute
        day_of_week = dt.weekday()
        
        # hour to cyclical representation
        hour_sin = np.sin(2 * np.pi * hour / 24)
        hour_cos = np.cos(2 * np.pi * hour / 24)
        
        # minute to cyclical representation
        minute_sin = np.sin(2 * np.pi * minute / 60)
        minute_cos = np.cos(2 * np.pi * minute / 60)
        
        # day of week to cyclical representation
        day_sin = np.sin(2 * np.pi * day_of_week / 7)
        day_cos = np.cos(2 * np.pi * day_of_week / 7)
        
        features.append([hour_sin, hour_cos, minute_sin, minute_cos, day_sin, day_cos])
    
    return np.array(features)

def train_model(X, y):
    global model, scaler
    with model_lock:
        # scale data
        scaler = StandardScaler()
        X_scaled = scaler.fit_transform(X)
        
        # train linear regression model
        model = LinearRegression()
        model.fit(X_scaled, y)
        
        # save model and scaler
        joblib.dump(model, model_path)
        joblib.dump(scaler, scaler_path)
    
    logger.info("model trained and saved")

def load_or_create_model():
    global model, scaler
    with model_lock:
        if os.path.exists(model_path) and os.path.exists(scaler_path):
            try:
                model = joblib.load(model_path)
                scaler = joblib.load(scaler_path)
                logger.info("model loaded from disk")
                return True
            except Exception as e:
                logger.error(f"error loading model: {e}")
                return False
        return False

@app.on_event("startup")
async def startup_event():
    load_or_create_model()

@app.post("/predict", response_model=PredictionResponse)
async def predict_traffic(data: TrafficData):
    global model, scaler
    
    if not data.timestamps or not data.requestCounts:
        raise HTTPException(status_code=400, detail="empty data provided")
    
    if len(data.timestamps) != len(data.requestCounts):
        raise HTTPException(status_code=400, detail="timestamps and requestCounts must have the same length")
    
    try:

        time_features = extract_time_features(data.timestamps)
        request_counts = np.array(data.requestCounts)
        
        # if we have enough data, train or update the model
        if len(request_counts) >= 12:  # at least 1 hour of data (assuming 5-min intervals)
            X = time_features
            y = request_counts
            train_model(X, y)
        
        # make prediction for next timestamp
        if model is not None and scaler is not None:
            # generate next timestamp (5 minutes from latest)
            last_timestamp = data.timestamps[-1]
            last_dt = datetime.datetime.fromisoformat(last_timestamp.replace('Z', '+00:00'))
            next_dt = last_dt + datetime.timedelta(minutes=5)
            next_timestamp = next_dt.isoformat().replace('+00:00', 'Z')
            
            #extract features for next timestamp
            next_features = extract_time_features([next_timestamp])
            
            # scale features
            next_features_scaled = scaler.transform(next_features)
            
            # making prediction
            predicted_load = float(model.predict(next_features_scaled)[0])
            
            # calculate confidence (simple heuristic based on data size)
            confidence = min(0.9, 0.5 + (len(request_counts) / 300))
            
            # ensure the predicted load is within reasonable bounds
            predicted_load = max(0, min(100, predicted_load))
            
            return PredictionResponse(
                predictedLoad=predicted_load,
                confidence=confidence,
                nextTimestamp=next_timestamp
            )
        else:
            # If no model is available, return default values
            return PredictionResponse(
                predictedLoad=30.0,  # Default prediction
                confidence=0.1,
                nextTimestamp=data.timestamps[-1]
            )
    
    except Exception as e:
        logger.error(f"Prediction error: {e}")
        raise HTTPException(status_code=500, detail=f"Prediction error: {str(e)}")

@app.get("/health")
async def health_check():
    return {"status": "healthy", "model_loaded": model is not None}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app:app", host="0.0.0.0", port=5000, reload=True)
