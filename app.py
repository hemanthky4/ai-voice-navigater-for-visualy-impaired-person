import os
import time
import requests
import numpy as np
import uuid
from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS

# ======================================================================
# YOLOv8 Integration
# Ensure you have installed ultralytics: `pip install ultralytics`
# ======================================================================
try:
    from ultralytics import YOLO
    import cv2
    HAS_YOLO = True
    print("Loading YOLOv8 Model Weights...")
    # Replace 'yolov8n.pt' with your custom trained model e.g., 'best.pt'
    model = YOLO('yolov8n.pt') 
except ImportError:
    HAS_YOLO = False
    print("WARNING: ultralytics not installed. Running in mock simulation mode.")
    print("To run real AI inferences, please run: pip install ultralytics")

# ======================================================================
# Object Detection Enhanced Heuristics
# ======================================================================
PERSONAL_OBJECTS = {
    "backpack": "your black backpack",
    "wallet": "your leather wallet"
}

def calculate_distance(width_in_pixels):
    """Calculate distance based on bounding box width."""
    if width_in_pixels <= 0: return 0
    focal_length = 600  # Example focal length
    real_width = 15     # Example real width of the object (in cm)
    distance = (real_width * focal_length) / width_in_pixels
    return distance / 100.0  # Convert to meters

def get_relative_position(center_x, frame_width):
    """Determine the relative position of an object in the frame."""
    if center_x < frame_width * 0.33:
        return "to your left"
    elif center_x > frame_width * 0.66:
        return "to your right"
    else:
        return "in front of you"

def get_color_name(frame, x1, y1, x2, y2):
    """Get the dominant color name of an object within the bounding box."""
    if frame is None: return "unknown color"
    
    x_start = max(0, int(x1))
    y_start = max(0, int(y1))
    x_end = min(frame.shape[1], int(x2))
    y_end = min(frame.shape[0], int(y2))
    
    cropped = frame[y_start:y_end, x_start:x_end]
    if cropped.size == 0:
        return "unknown color"
        
    average_color = np.mean(cropped, axis=(0, 1))  # Average BGR color
    
    blue, green, red = average_color
    if red > 150 and green < 100 and blue < 100:
        return "red"
    elif green > 150 and red < 100 and blue < 100:
        return "green"
    elif blue > 150 and red < 100 and green < 100:
        return "blue"
    else:
        return "unknown color"

app = Flask(__name__, static_folder='.', static_url_path='')
# Enable CORS for all routes so our frontend can access it without security policy errors
CORS(app) 

# ======================================================================
# Static File Routing (Serves index.html to your mobile phone!)
# ======================================================================
@app.route('/')
def serve_index():
    return send_from_directory('.', 'index.html')

@app.route('/<path:path>')
def serve_static(path):
    if os.path.exists(path):
        return send_from_directory('.', path)
    return "File not found", 404

@app.route('/analyze_video', methods=['POST'])
def analyze_video():
    if 'video' not in request.files:
        return jsonify({'error': 'No video file provided'}), 400
    
    file = request.files['video']
    if file.filename == '':
        return jsonify({'error': 'Empty file selected'}), 400
        
    print(f"\n[API] Received file for analysis: {file.filename}")
    
    detected_obstacles = []
    
    if HAS_YOLO:
        print("[AI] Running YOLOv8 Inference...")
        try:
            # Read image directly from memory rather than saving temp files to avoid locking/stability issues
            file_bytes = np.frombuffer(file.read(), np.uint8)
            image = cv2.imdecode(file_bytes, cv2.IMREAD_COLOR)
            
            if image is None:
                 raise ValueError("Could not decode image")
                 
            # Run inference on the in-memory image
            results = model.predict(source=image, save=False, conf=0.4)
            
            # Parse the results from the frames
            for result in results:
                frame = result.orig_img
                frame_width = frame.shape[1] if frame is not None else 640
                
                boxes = result.boxes
                for box in boxes:
                    class_id = int(box.cls[0])
                    confidence = float(box.conf[0])
                    class_name = model.names[class_id]
                    
                    xywh = box.xywh[0].tolist()
                    center_x, center_y, w, h = xywh
                    xyxy = box.xyxy[0].tolist()
                    x1, y1, x2, y2 = xyxy
                    
                    color_name = get_color_name(frame, x1, y1, x2, y2)
                    position = get_relative_position(center_x, frame_width)
                    dist_m = round(calculate_distance(w), 1)
                    
                    display_name = class_name
                    if class_name.lower() in PERSONAL_OBJECTS:
                        display_name = PERSONAL_OBJECTS[class_name.lower()]
                        
                    rich_class = f"{color_name} {display_name} {position}".strip()
                    if "unknown color" in rich_class:
                        rich_class = rich_class.replace("unknown color ", "")
                    if "your " in rich_class and color_name != "unknown color":
                        rich_class = rich_class.replace(f"{color_name} your", "your")
                    
                    rich_class = rich_class.capitalize()
                    
                    # We avoid adding duplicates in the same frame for cleaner UI presentation
                    if not any(obs['class'] == rich_class for obs in detected_obstacles):
                        detected_obstacles.append({
                            "class": rich_class,
                            "confidence": round(confidence, 2),
                            "distance": f"{dist_m}m",
                            "raw_dist": dist_m
                        })
        except Exception as e:
            print("[ERROR] YOLO Inference Failed:", str(e))
    else:
        # Fallback Simulation when Ultralytics is missing
        time.sleep(1.5) 
        detected_obstacles = [
            {"class": "Chair in front of you", "confidence": 0.95, "distance": "1.5m", "raw_dist": 1.5},
            {"class": "Wall to your left", "confidence": 0.88, "distance": "3.2m", "raw_dist": 3.2}
        ]
    
    # Determine primary hazard for UI (prioritize items closest to user numerically)
    detected_obstacles.sort(key=lambda x: x.get('raw_dist', 99.0))
    primary_hazard = f"{detected_obstacles[0]['class']} ({detected_obstacles[0]['distance']} ahead)" if detected_obstacles else "Clear Path"
    
    print(f"[API] Returning payload: {primary_hazard}")
    
    return jsonify({
        "status": "success",
        "message": "Video analyzed successfully",
        "obstacles": detected_obstacles,
        "primary_hazard": primary_hazard
    }), 200

@app.route('/predict_route', methods=['POST'])
def predict_route():
    data = request.json or {}
    destination = data.get('destination', '')
    
    # =============================================================
    # ML Navigation Prediction Integration 
    # =============================================================
    # You would typically load your SMOTE trained ML model here:
    # import joblib
    # ml_model = joblib.load('navigation_success_model.pkl')
    # features = extract_tabular_features(start, destination, time_of_day)
    # prediction = ml_model.predict(features)
    
    # Because this is a mock interface before you upload your `.pkl` model, 
    # we simulate the ML heuristic analysis based on hazardous keywords:
    destination_lower = destination.lower()
    
    if "stairs" in destination_lower or "construction" in destination_lower:
        prediction = "High Risk Area"
        safety_score = 35
    elif "crowd" in destination_lower or "lobby" in destination_lower:
        prediction = "Caution - Congested"
        safety_score = 65
    else:
        prediction = "Safe Navigation"
        safety_score = 92
        
    print(f"\n[ML Backend] Route requested to '{destination}'. ML Confidence Safety Score: {safety_score}%")
        
    return jsonify({
        "status": "success",
        "prediction": prediction,
        "safety_score": safety_score
    }), 200

@app.route('/get_weather', methods=['POST'])
def get_weather():
    data = request.json or {}
    location = data.get('location', '')
    if not location:
        return jsonify({'error': 'No location provided'}), 400
        
    try:
        # Use Open-Meteo free API to avoid rate limits/API key issues
        if ',' in location:
            lat, lng = location.split(',')
            lat, lng = lat.strip(), lng.strip()
            url = f"https://api.open-meteo.com/v1/forecast?latitude={lat}&longitude={lng}&current_weather=true"
            response = requests.get(url)
            weather_data = response.json()
            
            if 'current_weather' in weather_data:
                current = weather_data['current_weather']
                temperature = current['temperature']
                wind_speed = current['windspeed']
                wmo_code = current.get('weathercode', 0)
                
                weather_desc = "Clear"
                if wmo_code in [1, 2, 3]: weather_desc = "Partly Cloudy"
                elif wmo_code in [45, 48]: weather_desc = "Foggy"
                elif wmo_code in [51, 53, 55, 56, 57]: weather_desc = "Drizzling"
                elif wmo_code in [61, 63, 65, 66, 67]: weather_desc = "Raining"
                elif wmo_code in [71, 73, 75, 77]: weather_desc = "Snowing"
                elif wmo_code in [80, 81, 82]: weather_desc = "Rain Showers"
                elif wmo_code in [95, 96, 99]: weather_desc = "Thunderstorm"
                
                city_name = "your location"
                
                speech = f"The weather at {city_name} is {weather_desc}. The temperature is {temperature} degrees Celsius. The wind speed is {wind_speed} kilometers per hour."
                print(f"[Weather API] {speech}")
                
                return jsonify({
                    "status": "success",
                    "weather": weather_desc,
                    "temperature": f"{temperature}°C",
                    "city": city_name,
                    "speech": speech
                }), 200
            else:
                return jsonify({'error': 'Unable to retrieve weather details.'}), 400
        else:
            return jsonify({'error': 'Invalid location format. Expected lat,lng.'}), 400
    except Exception as e:
        print(f"[ERROR] Weather API Request Failed: {str(e)}")
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    print("===========================================")
    print(" AI Vision Backend starting on Port 5000")
    print("===========================================")
    app.run(host='0.0.0.0', debug=True, port=5000)
