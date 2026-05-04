# 🏭 Smart Industrial Machine Monitoring & Predictive Maintenance

![Industry 4.0](https://img.shields.io/badge/Industry-4.0-blue.svg)
![Edge AI](https://img.shields.io/badge/Edge-AI-orange.svg)
![Digital Twin](https://img.shields.io/badge/Digital-Twin-success.svg)
![ESP32](https://img.shields.io/badge/Hardware-ESP32-lightgrey.svg)

An enterprise-grade Industry 4.0 predictive maintenance system that leverages **Sensor Fusion, Edge Digital Signal Processing (DSP), Unsupervised AI (LSTM Autoencoders), and 3D Digital Twin Visualization** to detect machinery failures before they occur.

**Authors:** Kushagra Agarwal & Aditya Rana  
**Guided by:** Dr. Ayush Agrawal

---

## 📖 Project Overview
In modern manufacturing, unplanned machinery downtime costs billions annually. Traditional IoT systems attempt to solve this by streaming raw, high-frequency sensor data to the cloud, leading to massive bandwidth exhaustion, high latency, and exorbitant cloud compute costs. Furthermore, because industrial motors rarely fail, acquiring dataset to train supervised AI is nearly impossible.

**Our Solution:**
1. **Edge DSP:** An ESP32 microcontroller processes raw vibration data locally using a Fast Fourier Transform (FFT), transmitting only the Dominant Frequency and Magnitude. This reduces network payload by over 90%.
2. **Edge AI Gateway:** A local Python/Jetson Nano gateway runs an Unsupervised LSTM Autoencoder. It learns the "healthy footprint" of the machine and calculates an anomaly score based on reconstruction error, eliminating the need for failure datasets.
3. **Digital Twin:** A React-based 3D interactive dashboard dynamically reflects the real-time health of the physical machine.

---

## 🚀 Key Features
- **Bare-Metal Hardware Interaction:** Bypasses standard I2C libraries to prevent microcontroller panics during heavy physical machine vibration.
- **Hardware-Accelerated FFT:** Converts Time-Domain acceleration into Frequency-Domain data (Hz) directly on the ESP32.
- **Unsupervised Anomaly Detection:** Utilizes an LSTM Autoencoder to detect subtle shifts in vibration frequencies and temperature correlations over time.
- **3D Digital Twin HUD:** Built with React Three Fiber, featuring conditional 3D mesh rendering (Green = Healthy, Yellow = Warning, Red = Critical) and real-time Recharts telemetry graphs.

---

## 🛠️ Technology Stack
* **Hardware:** ESP32-WROOM, MPU6050 (Vibration/Accelerometer), DS18B20 (Contact Temperature), DHT22 (Ambient Environment).
* **Firmware:** C++ / Arduino Core (Bare-metal I2C, arduinoFFT, OneWire).
* **Backend & AI:** Python 3, PySerial, Pandas, Scikit-Learn / TensorFlow (Keras), FastAPI.
* **Frontend:** React.js, Vite, Tailwind CSS, Recharts, `@react-three/fiber` (WebGL 3D rendering).

---

## 🔌 Hardware Setup & Wiring

| Sensor | ESP32 Pin | Protocol | Notes |
| :--- | :--- | :--- | :--- |
| **MPU6050** | GPIO 21 (SDA), GPIO 22 (SCL) | I2C | VCC to 3.3V. Must be rigidly mounted to the motor. |
| **DS18B20** | GPIO 4 | 1-Wire | Requires a 4.7kΩ pull-up resistor between VCC and Data. |
| **DHT22** | GPIO 5 | Digital | Measures ambient room temperature and humidity. |

*Note: Do not power a heavy-vibration DC test motor directly from the ESP32 pins. Use an external isolated power supply to prevent brownouts.*

