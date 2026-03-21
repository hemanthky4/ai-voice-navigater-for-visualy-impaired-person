import cv2
import numpy as np
import pyttsx3
import queue
import threading
import time

try:
    from ultralytics import YOLO
except ImportError:
    pass

class ObjectDetection:
    def __init__(self, engine, assistant=None):
        self.engine = engine
        self.assistant = assistant  # Link to the assistant
        
        try:
            self.model = YOLO('yolov8n.pt')
        except Exception:
            self.model = None

        # Queue for managing speech synthesis
        self.speech_queue = queue.Queue()
        self.speech_thread = threading.Thread(target=self.process_speech_queue, daemon=True)
        self.speech_thread.start()

        # Personal object database
        self.personal_objects = {}

    def process_speech_queue(self):
        """Threaded speech processor to handle speech synthesis without blocking."""
        while True:
            text = self.speech_queue.get()
            self.engine.say(text)
            self.engine.runAndWait()
            self.speech_queue.task_done()

    def speak(self, text):
        """Add text to the speech queue."""
        self.speech_queue.put(text)

    def add_personal_object(self, object_name, description):
        """Add personal objects to the database."""
        self.personal_objects[object_name.lower()] = description

    def detect_objects(self):
        if not self.model:
            self.speak("YOLO model could not be loaded. Please ensure ultralytics is installed.")
            return
            
        cap = cv2.VideoCapture(0)
        last_speech_time = time.time()
        
        while True:
            ret, frame = cap.read()
            if not ret:
                break

            results = self.model(frame, verbose=False)
            detected_objects = []  # For scene understanding

            for result in results:
                for box in result.boxes:
                    confidence = float(box.conf[0])
                    if confidence > 0.5:
                        class_id = int(box.cls[0])
                        label = self.model.names[class_id]
                        
                        x1, y1, x2, y2 = map(int, box.xyxy[0])
                        w = x2 - x1
                        h = y2 - y1

                        color_name = self.get_color_name(frame, x1, y1, w, h)
                        position = self.get_relative_position(x1 + w // 2, frame.shape[1])
                        distance = self.calculate_distance(w)

                        description = f"{label} of color {color_name} is {position}, approx {distance:.1f} m away."
                        if description not in detected_objects:
                            detected_objects.append(description)
                            
                            current_time = time.time()
                            if current_time - last_speech_time > 3: # prevent spamming voice
                                self.speak(description)
                                last_speech_time = current_time

                        # Personal object recognition
                        if label.lower() in self.personal_objects:
                            personal_description = f"{self.personal_objects[label.lower()]} is detected."
                            self.speak(personal_description)

                        # Draw bounding boxes
                        cv2.rectangle(frame, (x1, y1), (x2, y2), (255, 0, 0), 2)
                        cv2.putText(frame, description, (x1, y1 - 10), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 0, 0), 2)

            # Display frame
            cv2.imshow('Enhanced Object Detection', frame)

            if cv2.waitKey(1) == ord('q'):
                break

        cap.release()
        cv2.destroyAllWindows()

    def calculate_distance(self, width_in_pixels):
        """Calculate distance based on bounding box width."""
        focal_length = 600  # Example focal length (in pixels)
        real_width = 15  # Example real width of the object (in cm)
        if width_in_pixels == 0: width_in_pixels = 1
        distance = (real_width * focal_length) / width_in_pixels
        return distance / 100.0  # meters

    def get_relative_position(self, center_x, frame_width):
        """Determine the relative position of an object in the frame."""
        if center_x < frame_width * 0.33:
            return "to your left"
        elif center_x > frame_width * 0.66:
            return "to your right"
        else:
            return "in front of you"

    def get_color_name(self, frame, x, y, w, h):
        """Get the dominant color name of an object."""
        x = max(0, x)
        y = max(0, y)
        cropped = frame[y:y + h, x:x + w]
        if cropped.size == 0: return "unknown color"
        average_color = np.mean(cropped, axis=(0, 1))  # Average BGR color
        color_name = self.map_color(average_color)
        return color_name

    def map_color(self, bgr):
        """Map BGR color to a color name."""
        blue, green, red = bgr
        if red > 150 and green < 100 and blue < 100:
            return "red"
        elif green > 150 and red < 100 and blue < 100:
            return "green"
        elif blue > 150 and red < 100 and green < 100:
            return "blue"
        else:
            return "unknown color"


if __name__ == "__main__":
    engine = pyttsx3.init()
    object_detection = ObjectDetection(engine)

    # Add personal objects
    object_detection.add_personal_object("backpack", "your black backpack")
    object_detection.add_personal_object("wallet", "your leather wallet")

    object_detection.detect_objects()
