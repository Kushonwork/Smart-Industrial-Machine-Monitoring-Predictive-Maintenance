import serial
import csv
import os
from datetime import datetime
from pathlib import Path
from serial.tools import list_ports

SERIAL_PORT = os.getenv("SENSOR_SERIAL_PORT", "COM7")
BAUD_RATE = 115200
CSV_FILENAME = Path(__file__).parent / "machine_data_log.csv"


HEADERS =[
    "Timestamp", 
    "MotorTemp_C", 
    "AmbientTemp_C", 
    "AmbientHum_%", 
    "RawAccel_X_ms2", 
    "RawAccel_Y_ms2", 
    "RawAccel_Z_ms2", 
    "VibMagnitude_ms2", 
    "DominantFreq_Hz"
]

def start_logging():
    try:
        ser = serial.Serial(SERIAL_PORT, BAUD_RATE, timeout=2)
        print(f"✅ Connected to {SERIAL_PORT} at {BAUD_RATE} baud.")
        
        with open(CSV_FILENAME, mode='a', newline='', encoding="utf-8") as file:
            writer = csv.writer(file)
            
            if file.tell() == 0:
                writer.writerow(HEADERS)
                print("Created new CSV file with headers.")

            print("📡 Listening for data... (Press Ctrl+C to stop)")
            
            while True:
                if ser.in_waiting > 0:
                    line = ser.readline().decode('utf-8', errors='ignore').strip()
                    
                    if line:
                        sensor_data = line.split(',')
                        if len(sensor_data) != len(HEADERS) - 1:
                            print(f"Skipping malformed payload: {line}")
                            continue
                        timestamp = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
                        row = [timestamp] + sensor_data
                        
                        writer.writerow(row)
                        file.flush()
                        
                        
                        print(f"Logged: {row}")

    except serial.SerialException as e:
        ports = [p.device for p in list_ports.comports()]
        print(f" Serial Error: {e}")
        print(f"Available ports: {ports if ports else 'No serial ports detected'}")
        print("Make sure the Serial Monitor in Arduino IDE is CLOSED before running this script.")
    except KeyboardInterrupt:
        print("\n🛑 Logging stopped by user. Data saved securely.")
    finally:
        if 'ser' in locals() and ser.is_open:
            ser.close()

if __name__ == "__main__":
    start_logging()