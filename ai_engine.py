import numpy as np
import pandas as pd
from sklearn.ensemble import IsolationForest
from sklearn.preprocessing import RobustScaler
from typing import Dict, Tuple
import warnings
warnings.filterwarnings('ignore')

FEATURE_COLS = [
    'MotorTemp_C', 'AmbientTemp_C', 'AmbientHum_%',
    'RawAccel_X_ms2', 'RawAccel_Y_ms2', 'RawAccel_Z_ms2',
    'VibMagnitude_ms2', 'DominantFreq_Hz'
]

class PredictiveMaintenanceEngine:
    def __init__(self):
        self.model = IsolationForest(
            n_estimators=200,
            contamination=0.05,
            random_state=42,
            n_jobs=-1
        )
        self.scaler = RobustScaler()
        self.trained = False
        self.health_history: list = []
        self.anomaly_score_min = None
        self.anomaly_score_max = None

    def train(self, df: pd.DataFrame):
        """Train on first 70% of data (healthy baseline)."""
        train_size = int(len(df) * 0.7)
        train_df = df.iloc[:train_size]
        X_train = train_df[FEATURE_COLS].values
        X_scaled = self.scaler.fit_transform(X_train)
        self.model.fit(X_scaled)
        
        # Calibrate score range on full dataset
        X_all = self.scaler.transform(df[FEATURE_COLS].values)
        scores = self.model.score_samples(X_all)
        self.anomaly_score_min = float(scores.min())
        self.anomaly_score_max = float(scores.max())
        self.trained = True
        print(f"[AI Engine] Trained on {train_size} samples. Score range: [{self.anomaly_score_min:.3f}, {self.anomaly_score_max:.3f}]")

    def _anomaly_to_health(self, score: float) -> float:
        """Convert Isolation Forest score to 0-100 health score."""
        # score_samples returns negative values; more negative = more anomalous
        normalized = (score - self.anomaly_score_min) / (self.anomaly_score_max - self.anomaly_score_min + 1e-9)
        return float(np.clip(normalized * 100, 0, 100))

    def predict(self, row: pd.Series) -> Dict:
        if not self.trained:
            raise RuntimeError("Model not trained")
        
        X = row[FEATURE_COLS].values.reshape(1, -1)
        X_scaled = self.scaler.transform(X)
        
        score = float(self.model.score_samples(X_scaled)[0])
        health_score = self._anomaly_to_health(score)
        
        # Track history for trend analysis
        self.health_history.append(health_score)
        
        # Failure probability: inverse sigmoid of health
        failure_prob = float(1 / (1 + np.exp((health_score - 40) / 10)) * 100)
        
        # RUL estimation based on degradation trend
        rul_hours = self._estimate_rul(health_score)
        
        return {
            'health_score': round(health_score, 1),
            'failure_probability': round(failure_prob, 1),
            'rul_hours': rul_hours,
            'anomaly_score': round(score, 4),
            'status': self._get_status(health_score),
        }

    def _estimate_rul(self, current_health: float) -> int:
        """Estimate RUL using linear degradation trend over last 20 readings."""
        history = self.health_history[-20:]
        if len(history) < 5:
            return 9999
        
        # Fit linear trend
        x = np.arange(len(history))
        slope, _ = np.polyfit(x, history, 1)
        
        if slope >= 0:
            return 9999  # Not degrading
        
        # Time to reach critical threshold (health=20)
        steps_to_critical = (current_health - 20) / abs(slope)
        # Each step = 5 min in simulation → convert to hours
        rul_hours = max(0, int(steps_to_critical * 5 / 60))
        return min(rul_hours, 9999)

    def _get_status(self, health_score: float) -> str:
        if health_score >= 70:
            return 'HEALTHY'
        elif health_score >= 40:
            return 'WARNING'
        else:
            return 'CRITICAL'


engine = PredictiveMaintenanceEngine()
