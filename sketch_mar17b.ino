#include <Wire.h>
#include <OneWire.h>
#include <DallasTemperature.h>
#include <DHT.h>
#include <arduinoFFT.h>

// --- Pin Definitions ---
#define ONE_WIRE_BUS 4     
#define DHTPIN 5           
#define DHTTYPE DHT22      
#define MPU_ADDR 0x68      

// --- Sensor Objects ---
OneWire oneWire(ONE_WIRE_BUS);
DallasTemperature contactTemp(&oneWire);
DHT dht(DHTPIN, DHTTYPE);

// --- FFT Setup ---
const uint16_t samples = 128; 
const double samplingFrequency = 200.0; 
double vReal[samples];
double vImag[samples];
ArduinoFFT<double> FFT = ArduinoFFT<double>(vReal, vImag, samples, samplingFrequency);

void setup() {
  Serial.begin(115200);
  delay(100);

  Wire.begin(21, 22); 

  // Wake up MPU6050
  Wire.beginTransmission(MPU_ADDR);
  Wire.write(0x6B);  
  Wire.write(0);     
  Wire.endTransmission(true);

  // Set MPU6050 Range to +/- 8g
  Wire.beginTransmission(MPU_ADDR);
  Wire.write(0x1C);  
  Wire.write(0x10);  
  Wire.endTransmission(true);

  contactTemp.begin();
  dht.begin();
}

void processVibration(float &rawX, float &rawY, float &rawZ, float &magnitude, double &peakFrequency) {
  float sumX = 0, sumY = 0, sumZ = 0, sumMag = 0;
  unsigned int sampling_period_us = round(1000000.0 / samplingFrequency);
  
  for (int i = 0; i < samples; i++) {
    unsigned long t = micros();
    
    Wire.beginTransmission(MPU_ADDR);
    Wire.write(0x3B); 
    Wire.endTransmission(false);
    Wire.requestFrom((uint16_t)MPU_ADDR, (uint8_t)6, true); 
    
    int16_t ax = Wire.read()<<8 | Wire.read();
    int16_t ay = Wire.read()<<8 | Wire.read();
    int16_t az = Wire.read()<<8 | Wire.read();
    
    float accelX = (ax / 4096.0) * 9.81;
    float accelY = (ay / 4096.0) * 9.81;
    float accelZ = (az / 4096.0) * 9.81;
    
    sumX += accelX;
    sumY += accelY;
    sumZ += accelZ;
    
    float currentMag = sqrt(pow(accelX, 2) + pow(accelY, 2) + pow(accelZ, 2));
    sumMag += currentMag;
    
    vReal[i] = accelZ; 
    vImag[i] = 0.0; 
    
    while ((micros() - t) < sampling_period_us) { }
  }
  
  // Average raw axes and magnitude over the 128 samples
  rawX = sumX / samples;
  rawY = sumY / samples;
  rawZ = sumZ / samples;
  magnitude = sumMag / samples;

  FFT.windowing(FFT_WIN_TYP_HAMMING, FFT_FORWARD);
  FFT.compute(FFT_FORWARD);
  FFT.complexToMagnitude();
  peakFrequency = FFT.majorPeak();
}

void loop() {
  float ambHum = dht.readHumidity();
  float ambTemp = dht.readTemperature();

  contactTemp.requestTemperatures();
  float motorTemp = contactTemp.getTempCByIndex(0);

  float rawX = 0, rawY = 0, rawZ = 0, vibMagnitude = 0;
  double vibPeakHz = 0;
  
  processVibration(rawX, rawY, rawZ, vibMagnitude, vibPeakHz); 

  // Handle DHT failure gracefully so it doesn't break the CSV columns
  if (isnan(ambTemp) || isnan(ambHum)) {
    ambTemp = 0.0;
    ambHum = 0.0;
  }

  // OUTPUT FORMAT: MotorTemp, AmbientTemp, AmbientHum, RawX, RawY, RawZ, VibMag, VibFreq
  Serial.print(motorTemp); Serial.print(",");
  Serial.print(ambTemp); Serial.print(",");
  Serial.print(ambHum); Serial.print(",");
  Serial.print(rawX); Serial.print(",");
  Serial.print(rawY); Serial.print(",");
  Serial.print(rawZ); Serial.print(",");
  Serial.print(vibMagnitude); Serial.print(",");
  Serial.println(vibPeakHz);

  delay(1000); 
}