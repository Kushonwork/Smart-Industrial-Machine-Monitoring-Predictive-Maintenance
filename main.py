import asyncio
from pathlib import Path
from typing import Dict, List, Optional
import pandas as pd
import numpy as np
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from ai_engine import PredictiveMaintenanceEngine, FEATURE_COLS

app = FastAPI(title="Predictive Maintenance API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── State ──────────────────────────────────────────────────────────────────────
CSV_PATH = Path(__file__).parent / "machine_data_log.csv"
df_global: Optional[pd.DataFrame] = None
engines: Dict[str, PredictiveMaintenanceEngine] = {}
latest_readings: Dict[str, dict] = {}
history_store: Dict[str, List[dict]] = {}
last_processed_index: int = 0
last_csv_mtime: float = 0.0
dummy_stream_index: Dict[str, int] = {}

MACHINES = [
    {"id": "M001", "name": "Compressor A", "type": "compressor", "x": 15, "y": 20},
    {"id": "M002", "name": "Motor Drive B", "type": "motor",      "x": 45, "y": 20},
    {"id": "M003", "name": "Pump Unit C",   "type": "pump",       "x": 75, "y": 20},
    {"id": "M004", "name": "Conveyor D",    "type": "conveyor",   "x": 15, "y": 65},
    {"id": "M005", "name": "Robot Arm E",   "type": "robot",      "x": 45, "y": 65},
    {"id": "M006", "name": "Turbine F",     "type": "turbine",    "x": 75, "y": 65},
]


def generate_sample_dataset(path: Path, rows: int = 2000) -> None:
    """Generate fallback telemetry when CSV is missing."""
    timestamps = pd.date_range(end=pd.Timestamp.now(), periods=rows, freq="5min")

    trend = np.linspace(0, 1, rows)
    noise = np.random.normal(0, 1, rows)
    vib_base = np.abs(np.random.normal(3.0, 0.8, rows)) + trend * 2.5

    data = pd.DataFrame(
        {
            "Timestamp": timestamps,
            "MotorTemp_C": 65 + trend * 20 + noise * 1.5,
            "AmbientTemp_C": 30 + noise * 0.8,
            "AmbientHum_%": np.clip(50 + np.random.normal(0, 8, rows), 20, 95),
            "RawAccel_X_ms2": np.random.normal(0, 0.25, rows),
            "RawAccel_Y_ms2": np.random.normal(0, 0.25, rows),
            "RawAccel_Z_ms2": np.random.normal(9.81, 0.3, rows),
            "VibMagnitude_ms2": np.clip(vib_base, 0.1, None),
            "DominantFreq_Hz": np.clip(45 + trend * 18 + np.random.normal(0, 2, rows), 10, None),
        }
    )
    data.to_csv(path, index=False)
    print(f"[API] Generated fallback dataset at {path} ({rows} rows)")


def load_csv_dataframe() -> pd.DataFrame:
    """Load CSV with required schema and stable numeric types."""
    if not CSV_PATH.exists():
        generate_sample_dataset(CSV_PATH)
    df = pd.read_csv(CSV_PATH, parse_dates=["Timestamp"])
    if df.empty:
        raise RuntimeError("CSV file is empty. Start logger.py first.")
    missing = [c for c in FEATURE_COLS if c not in df.columns]
    if missing:
        raise RuntimeError(f"CSV missing required columns: {missing}")
    for col in FEATURE_COLS:
        df[col] = pd.to_numeric(df[col], errors="coerce")
    df = df.dropna(subset=FEATURE_COLS).reset_index(drop=True)
    if df.empty:
        raise RuntimeError("CSV has no valid numeric feature rows.")
    return df


def apply_machine_variation(row: pd.Series, machine_index: int) -> pd.Series:
    """Single sensor stream -> virtual per-machine variation."""
    varied = row.copy()
    # Keep realistic but distinct machine traces from one physical stream.
    temp_offset = [0.0, 1.2, -0.8, 2.4, -1.6, 0.7][machine_index]
    vib_scale = [1.00, 1.08, 0.95, 1.15, 0.90, 1.20][machine_index]
    freq_shift = [0.0, 0.8, -0.5, 1.4, -1.1, 1.9][machine_index]
    varied["MotorTemp_C"] = float(varied["MotorTemp_C"]) + temp_offset
    varied["VibMagnitude_ms2"] = max(0.0, float(varied["VibMagnitude_ms2"]) * vib_scale)
    varied["DominantFreq_Hz"] = max(0.0, float(varied["DominantFreq_Hz"]) + freq_shift)
    return varied


def refresh_csv_if_updated() -> None:
    """Reload in-memory dataframe when logger writes new rows."""
    global df_global, last_csv_mtime
    if not CSV_PATH.exists():
        return
    current_mtime = CSV_PATH.stat().st_mtime
    if current_mtime <= last_csv_mtime:
        return
    latest = load_csv_dataframe()
    df_global = latest
    last_csv_mtime = current_mtime

# ── Startup ────────────────────────────────────────────────────────────────────
@app.on_event("startup")
async def startup():
    global df_global, last_processed_index, last_csv_mtime
    df_global = load_csv_dataframe()
    last_csv_mtime = CSV_PATH.stat().st_mtime if CSV_PATH.exists() else 0.0
    last_processed_index = 0
    print(f"[API] Loaded {len(df_global)} rows from CSV")

    for i, m in enumerate(MACHINES):
        mid = m["id"]
        eng = PredictiveMaintenanceEngine()
        eng.train(df_global)
        engines[mid] = eng
        history_store[mid] = []
        latest_readings[mid] = {}
        if mid == "M001":
            dummy_stream_index[mid] = 0
        else:
            # Dummy machines replay CSV with staggered offsets.
            dummy_stream_index[mid] = (i * 120) % max(len(df_global), 1)
    
    print("[API] All engines trained. Starting background streamer...")
    asyncio.create_task(background_streamer())

# ── Background data streamer ───────────────────────────────────────────────────
async def background_streamer():
    """Continuously ingest latest logger rows and publish AI predictions."""
    global last_processed_index
    while True:
        try:
            refresh_csv_if_updated()
            if df_global is None or df_global.empty:
                await asyncio.sleep(3)
                continue

            if last_processed_index < len(df_global):
                last_processed_index += 1
            real_row = df_global.iloc[-1]

            for i, m in enumerate(MACHINES):
                mid = m["id"]
                if mid == "M001":
                    # True motor stream: always latest logger row.
                    row = real_row
                else:
                    # Other appliances: dummy replay from CSV history.
                    idx = dummy_stream_index[mid] % len(df_global)
                    base_dummy = df_global.iloc[idx]
                    row = apply_machine_variation(base_dummy, i)
                    dummy_stream_index[mid] += 1
                prediction = engines[mid].predict(row)
                reading = {
                    "timestamp": row["Timestamp"].isoformat(),
                    "machine_id": mid,
                    **{col: round(float(row[col]), 3) for col in FEATURE_COLS},
                    **prediction,
                }
                latest_readings[mid] = reading
                history_store[mid].append(reading)
                if len(history_store[mid]) > 200:
                    history_store[mid] = history_store[mid][-200:]
        except Exception as exc:
            print(f"[API] Stream loop warning: {exc}")
        await asyncio.sleep(3)

# ── Endpoints ──────────────────────────────────────────────────────────────────
@app.get("/machines")
def get_machines():
    return MACHINES

@app.get("/machines/{machine_id}/status")
def get_machine_status(machine_id: str):
    if machine_id not in latest_readings or not latest_readings[machine_id]:
        raise HTTPException(404, "No data yet")
    return latest_readings[machine_id]

@app.get("/machines/all/status")
def get_all_status():
    return {mid: latest_readings.get(mid, {}) for m in MACHINES for mid in [m["id"]]}

@app.get("/machines/{machine_id}/history")
def get_machine_history(machine_id: str, limit: int = 100):
    if machine_id not in history_store:
        raise HTTPException(404, "Machine not found")
    data = history_store[machine_id][-limit:]
    return data

@app.get("/factory/overview")
def factory_overview():
    summary = []
    for m in MACHINES:
        mid = m["id"]
        r = latest_readings.get(mid, {})
        summary.append({
            **m,
            "health_score": r.get("health_score", 100),
            "status": r.get("status", "HEALTHY"),
            "failure_probability": r.get("failure_probability", 0),
            "rul_hours": r.get("rul_hours", 9999),
        })
    return summary

@app.get("/health")
def health_check():
    return {"status": "ok", "machines": len(MACHINES)}
