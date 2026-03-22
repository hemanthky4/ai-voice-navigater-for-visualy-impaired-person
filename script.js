document.addEventListener('DOMContentLoaded', () => {

    let BACKEND_URL = 'https://ai-voice-navigater-for-visualy-impaired.onrender.com';


    // ---- AI Voice Feedback Helper ----
    function speak(text) {
        if ('speechSynthesis' in window) {
            window.speechSynthesis.cancel();
            const msg = new SpeechSynthesisUtterance(text);
            msg.rate = 1.0;
            msg.pitch = 1.0;
            window.speechSynthesis.speak(msg);
        }
    }

    let lastSpokenHazard = "";
    function updateObstacleUI(hazardStr) {
        if (!hazardStr) return;
        const obstacleContainers = document.querySelectorAll('.info-card');
        if (obstacleContainers.length > 1) {
            const obstacleCard = obstacleContainers[1];
            const obsValue = obstacleCard.querySelector('.info-value');
            if (obsValue) {
                obsValue.textContent = hazardStr;
                obsValue.classList.add('alert-text');
                
                obstacleCard.style.transform = 'translateY(-8px)';
                setTimeout(() => obstacleCard.style.transform = '', 300);
                
                if (hazardStr !== lastSpokenHazard && hazardStr !== "Clear Path") {
                    speak("Warning: " + hazardStr.split('(')[0]);
                    lastSpokenHazard = hazardStr;
                } else if (hazardStr === "Clear Path" && lastSpokenHazard !== "Clear Path") {
                    speak("Path is clear");
                    lastSpokenHazard = "Clear Path";
                }
            }
        }
    }

    // ---- FILE UPLOAD LOGIC ----
    const fileInput = document.getElementById('fileInput');
    const uploadArea = document.getElementById('uploadArea');
    const fileNameDisplay = document.getElementById('fileNameDisplay');
    const startAnalysisBtn = document.getElementById('startAnalysisBtn');
    
    // Prevent default drag behaviors
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        uploadArea.addEventListener(eventName, preventDefaults, false);
        document.body.addEventListener(eventName, preventDefaults, false);
    });
    
    // Highlight drop area when item is dragged over it
    ['dragenter', 'dragover'].forEach(eventName => {
        uploadArea.addEventListener(eventName, highlight, false);
    });
    
    ['dragleave', 'drop'].forEach(eventName => {
        uploadArea.addEventListener(eventName, unhighlight, false);
    });
    
    // Handle dropped files
    uploadArea.addEventListener('drop', handleDrop, false);
    
    // Handle file selection via input
    fileInput.addEventListener('change', function() {
        if (this.files.length > 0) {
            handleFile(this.files[0]);
        }
    });
    
    function preventDefaults(e) {
        e.preventDefault();
        e.stopPropagation();
    }
    
    function highlight(e) {
        uploadArea.classList.add('dragover');
    }
    
    function unhighlight(e) {
        uploadArea.classList.remove('dragover');
    }
    
    function handleDrop(e) {
        let dt = e.dataTransfer;
        let files = dt.files;
        if (files.length > 0) {
            handleFile(files[0]);
        }
    }
    
    function handleFile(file) {
        if (file.type.startsWith('video/')) {
            fileNameDisplay.innerHTML = `<i class="ph ph-check-circle"></i> ${file.name}`;
            startAnalysisBtn.removeAttribute('disabled');
        } else {
            fileNameDisplay.innerHTML = `<i class="ph ph-warning-circle text-red" style="color:#EF4444"></i> Please upload a valid video file.`;
            startAnalysisBtn.setAttribute('disabled', 'true');
        }
    }

    // ---- MAP LOGIC ----
    // Initialize Leaflet Map
    // Coordinates set to a realistic place, e.g., a simulated indoor layout or campus
    const startPos = [40.730610, -73.935242]; // Point A
    const endPos = [40.731510, -73.931242];   // Point B
    const middlePos = [ (startPos[0]+endPos[0])/2, (startPos[1]+endPos[1])/2 ];
    
    const map = L.map('map', {
        zoomControl: false // Disable default zoom control for cleaner look
    }).setView(middlePos, 16);
    
    // Add modern, clean tiles (CartoDB Positron gives a great minimal, soft look matching our blue/white theme)
    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
        subdomains: 'abcd',
        maxZoom: 20
    }).addTo(map);

    // Custom Marker Icons using pure CSS/HTML
    const startIcon = L.divIcon({
        className: 'custom-map-marker',
        html: `<div style="width: 24px; height: 24px; background: #2563EB; border: 3px solid #FFF; border-radius: 50%; box-shadow: 0 4px 10px rgba(0,0,0,0.3); display: flex; align-items:center; justify-content:center; color:#fff; font-size:10px; font-weight:bold;">A</div>`,
        iconSize: [24, 24],
        iconAnchor: [12, 12]
    });

    const endIcon = L.divIcon({
        className: 'custom-map-marker',
        html: `<div style="width: 24px; height: 24px; background: #10B981; border: 3px solid #FFF; border-radius: 50%; box-shadow: 0 4px 10px rgba(0,0,0,0.3); display: flex; align-items:center; justify-content:center; color:#fff; font-size:10px; font-weight:bold;">B</div>`,
        iconSize: [24, 24],
        iconAnchor: [12, 12]
    });

    window.routeLine = null;
    window.endMarker = null;
    window.userLocation = null;

    // ---- REAL-TIME LOCATION TRACKING ----
    let currentLocationMarker = null;

    map.on('locationerror', async function(e) {
        console.warn("Geolocation error:", e.message);
        
        // Fallback to IP-based location
        try {
            const response = await fetch('https://ipapi.co/json/');
            const data = await response.json();
            if (data && data.latitude && data.longitude) {
                const latlng = { lat: data.latitude, lng: data.longitude };
                window.userLocation = latlng;
                // Simulate a locationfound event
                map.fireEvent('locationfound', { latlng: latlng });
                if (typeof speak === 'function') speak("Using approximate network location");
            } else {
                throw new Error("Invalid IP location data");
            }
        } catch (err) {
            console.error("IP fallback failed:", err);
            alert("Location access denied or unavailable. Please ensure location permissions are granted.");
        }
    });

    map.on('locationfound', function(e) {
        window.userLocation = e.latlng;
        if (!currentLocationMarker) {
            currentLocationMarker = L.marker(e.latlng, {
                icon: L.divIcon({
                    className: 'custom-map-marker',
                    html: `<div style="width: 24px; height: 24px; background: #2563EB; border: 3px solid #FFF; border-radius: 50%; box-shadow: 0 4px 10px rgba(0,0,0,0.3); display: flex; align-items:center; justify-content:center; color:#fff; font-size:14px;"><i class="ph ph-crosshair"></i></div>`,
                    iconSize: [24, 24],
                    iconAnchor: [12, 12]
                })
            }).addTo(map);
            currentLocationMarker.bindPopup("<b>You are here</b><br>Live Tracking Active").openPopup();
            
            // Re-center map to include current location
            map.setView(e.latlng, 18);
        } else {
            currentLocationMarker.setLatLng(e.latlng);
        }
        
        // Update the UI showing current location is active
        const locationContainers = document.querySelectorAll('.info-card');
        if (locationContainers.length > 0) {
            const locCard = locationContainers[0]; // First card is current location
            const locValue = locCard.querySelector('.info-value');
            if (locValue) {
                locValue.textContent = "Live Tracking...";
                locValue.classList.add('success-text');
            }
        }
        
        // Fetch weather for this coordinate
        if (!window.weatherFetched) {
            window.weatherFetched = true; // Only fetch once to prevent spamming the API on every move
            fetchWeatherForLocation(e.latlng.lat, e.latlng.lng);
        }
    });

    async function fetchWeatherForLocation(lat, lng) {
        const query = `${lat},${lng}`;
        try {
            const response = await fetch(`${BACKEND_URL}/get_weather`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ location: query })
            });

            if (response.ok) {
                const data = await response.json();
                if (data.status === "success") {
                    const weatherValue = document.getElementById('weatherValue');
                    if (weatherValue) {
                        weatherValue.textContent = `${data.weather}, ${data.temperature}`;
                    }
                    if (typeof speak === 'function') {
                        // Optionally speak weather upon launch to confirm integration
                        speak(`Current weather in ${data.city} is ${data.weather} at ${data.temperature}`);
                    }
                }
            } else {
                console.error("Failed to fetch weather. Status:", response.status);
                const weatherValue = document.getElementById('weatherValue');
                if (weatherValue) weatherValue.textContent = "Unavailable";
            }
        } catch (error) {
            console.error("Error fetching weather:", error);
            const weatherValue = document.getElementById('weatherValue');
            if (weatherValue) weatherValue.textContent = "Unavailable";
            window.weatherFetched = false; // allow retry
        }
    }

    // Start tracking when map is ready
    map.locate({setView: false, maxZoom: 18, watch: true, enableHighAccuracy: true});


    // ---- AI VOICE RECOGNITION (Web Speech API) ----
    const voiceInputBtn = document.getElementById('voiceInputBtn');
    const destinationInput = document.getElementById('destinationInput');
    
    // Check for browser support
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    let recognition;
    
    if (SpeechRecognition) {
        recognition = new SpeechRecognition();
        recognition.continuous = false;
        recognition.lang = 'en-US';
        recognition.interimResults = false;
        recognition.maxAlternatives = 1;

        recognition.onstart = function() {
            voiceInputBtn.style.backgroundColor = 'var(--alert-red)'; // Record mode color
            destinationInput.placeholder = "Listening...";
            speak("Listening for destination");
        };

        recognition.onresult = function(event) {
            const transcript = event.results[0][0].transcript;
            destinationInput.value = transcript;
            speak(`Destination set to ${transcript}`);
        };

        recognition.onend = function() {
            voiceInputBtn.style.backgroundColor = 'var(--primary-blue)';
            if (!destinationInput.value) {
                destinationInput.placeholder = "e.g., Main Hallway, Room 101";
            }
        };
        
        recognition.onerror = function(event) {
            console.error('Speech recognition error: ' + event.error);
            destinationInput.placeholder = "Voice error. Try typing.";
            voiceInputBtn.style.backgroundColor = 'var(--primary-blue)';
            speak("Voice error, please try again");
        };
    } else {
        console.warn('Speech Recognition API not supported in this browser.');
        const icon = voiceInputBtn.querySelector('i');
        if(icon) {
            icon.classList.remove('ph-microphone');
            icon.classList.add('ph-microphone-slash');
        }
        voiceInputBtn.disabled = true;
    }

    // Interactive Buttons
    document.getElementById('startNavBtn').addEventListener('click', async () => {
        const destination = destinationInput.value.trim();
        if(destination !== '') {
            if (!window.userLocation) {
                alert("Waiting for your current location. Please wait a moment.");
                speak("Waiting for current location.");
                return;
            }

            const navBtn = document.getElementById('startNavBtn');
            const originalNavText = navBtn.innerHTML;
            navBtn.innerHTML = '<i class="ph ph-spinner ph-spin"></i> Calculating Route...';
            
            try {
                // 1. Geocode Destination with Nominatim
                const geoRes = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(destination)}`);
                const geoData = await geoRes.json();
                
                if (!geoData || geoData.length === 0) {
                    throw new Error("Location couldn't be found on the map");
                }
                
                const endLat = parseFloat(geoData[0].lat);
                const endLng = parseFloat(geoData[0].lon);
                
                // 2. OSRM Routing from User Location to Destination
                const routeRes = await fetch(`https://router.project-osrm.org/route/v1/foot/${window.userLocation.lng},${window.userLocation.lat};${endLng},${endLat}?overview=full&geometries=geojson`);
                const routeData = await routeRes.json();
                
                if (routeData.code !== 'Ok') throw new Error("No route found");
                
                const coordinates = routeData.routes[0].geometry.coordinates;
                const routePoints = coordinates.map(coord => [coord[1], coord[0]]); // [lat, lng]
                
                // 3. Draw on Map
                if (window.routeLine) map.removeLayer(window.routeLine);
                window.routeLine = L.polyline(routePoints, {
                    color: '#10B981', weight: 6, opacity: 0.8, lineCap: 'round', lineJoin: 'round', dashArray: '10, 15', className: 'route-path animated-dash'
                }).addTo(map);
                
                if (window.endMarker) window.endMarker.setLatLng([endLat, endLng]).bindPopup(`<b>Destination</b><br>${destination}`).openPopup();
                else window.endMarker = L.marker([endLat, endLng], {icon: endIcon}).addTo(map).bindPopup(`<b>Destination</b><br>${destination}`).openPopup();
                
                map.fitBounds(window.routeLine.getBounds(), { padding: [50, 50] });

                // 4. Query ML Backend for Safety Score
                const response = await fetch(`${BACKEND_URL}/predict_route`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ start: "Current Location", destination: destination, timeOfDay: new Date().getHours() })
                });
                
                if (!response.ok) throw new Error("Server error");
                const data = await response.json();
                
                if (window.routeLine) {
                    let routeColor = '#10B981';
                    if (data.safety_score < 40) routeColor = '#EF4444';
                    else if (data.safety_score < 75) routeColor = '#F59E0B';
                    window.routeLine.setStyle({ color: routeColor });
                }
                
                const statusContainers = document.querySelectorAll('.info-card');
                if (statusContainers.length > 2) {
                    const statusCard = statusContainers[2]; 
                    const statusValue = statusCard.querySelector('.info-value');
                    const statusLabel = statusCard.querySelector('.info-label');
                    const statusIcon = statusCard.querySelector('.info-icon i');
                    
                    if (statusValue && data.prediction) {
                        statusLabel.textContent = "Route Safety ML";
                        statusValue.textContent = `${data.prediction} (${data.safety_score}%)`;
                        if (data.safety_score < 75) {
                            statusValue.className = 'info-value alert-text';
                            if (statusIcon) statusIcon.className = 'ph ph-warning';
                        } else {
                            statusValue.className = 'info-value success-text';
                            if (statusIcon) statusIcon.className = 'ph ph-check-circle';
                        }
                    }
                }
                speak(`Route calculated to ${destination}. ${data.prediction}. Safety score is ${data.safety_score} percent.`);
            } catch (err) {
                console.error("Routing Error:", err);
                alert(`Routing Error: ${err.message}. Please try a more specific external destination.`);
                speak(`Routing failed. ${err.message}`);
            } finally {
                navBtn.innerHTML = originalNavText;
            }
        } else {
            alert("Please provide a destination (via voice or text) first.");
            speak("Please provide a destination first.");
        }
    });
    
    voiceInputBtn.addEventListener('click', () => {
        if (recognition) {
            try {
                recognition.start();
            } catch(e) {
                console.warn('Listening already in progress');
            }
        } else {
            alert("AI Voice Recognition is not supported in your current browser.");
        }
    });
    
    startAnalysisBtn.addEventListener('click', async () => {
        const fileInput = document.getElementById('fileInput');
        if (!fileInput || !fileInput.files || fileInput.files.length === 0) {
            alert("No video file selected.");
            return;
        }

        const file = fileInput.files[0];
        const formData = new FormData();
        formData.append('video', file);

        // Update UI to show loading state
        const originalText = startAnalysisBtn.innerHTML;
        startAnalysisBtn.innerHTML = '<i class="ph ph-spinner ph-spin"></i> Analyzing...';
        startAnalysisBtn.disabled = true;

        try {
            const response = await fetch(`${BACKEND_URL}/analyze_video`, {
                method: 'POST',
                body: formData
            });

            if (!response.ok) {
                throw new Error(`Server error: ${response.status}`);
            }

            const data = await response.json();
            
            // Revert Button temporarily to show success
            startAnalysisBtn.innerHTML = '<i class="ph ph-check-circle"></i> Complete';
            setTimeout(() => {
                startAnalysisBtn.innerHTML = originalText;
                startAnalysisBtn.disabled = false;
            }, 3000);

            // Dynamically update the Nearest Obstacle UI card based on Backend Response
            if (data.status === "success" && data.primary_hazard) {
                updateObstacleUI(data.primary_hazard);
            }

        } catch (error) {
            console.error("Error analyzing video:", error);
            alert("Failed to connect to AI Backend. Make sure your Python Flask server is running at http://127.0.0.1:5000.");
            startAnalysisBtn.innerHTML = originalText;
            startAnalysisBtn.disabled = false;
        }
    });

    // ---- LIVE CAMERA STREAMING ----
    const startCameraBtn = document.getElementById('startCameraBtn');
    const liveCameraFeed = document.getElementById('liveCameraFeed');
    const uploadState = document.getElementById('uploadState');
    let liveStream = null;

    startCameraBtn.addEventListener('click', async () => {
        if (!liveStream) {
            try {
                // Request back camera specifically (facingMode: environment)
                liveStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
                
                // Hide upload UI, show video feed inside the card
                uploadState.style.display = 'none';
                uploadArea.classList.remove('dragover');
                uploadArea.style.padding = '0';
                uploadArea.style.border = 'none';
                
                liveCameraFeed.style.display = 'block';
                liveCameraFeed.srcObject = liveStream;
                
                // Update Buttons
                startCameraBtn.innerHTML = '<i class="ph ph-stop-circle" style="color:red;"></i> Stop Camera Analysis';
                startCameraBtn.style.borderColor = 'red';
                startCameraBtn.style.color = 'red';
                startCameraBtn.classList.add('pulse-animation');
                
                // Put Analysis button in "live" state visually
                startAnalysisBtn.innerHTML = '<i class="ph ph-spinner ph-spin"></i> Live Streaming...';
                startAnalysisBtn.disabled = true;

                startCameraBtn.dataset.live = 'true';
                speak("Live camera analysis started");
                captureAndAnalyzeFrame();

            } catch (err) {
                console.error("Camera access denied:", err);
                alert("Could not access camera. Please allow camera permissions in your browser.");
                speak("Could not access camera");
            }
        } else {
            // Stop Camera
            startCameraBtn.dataset.live = 'false';
            speak("Live camera analysis stopped");
            let tracks = liveStream.getTracks();
            tracks.forEach(track => track.stop());
            liveStream = null;
            
            // Revert UI to upload mode
            liveCameraFeed.style.display = 'none';
            uploadArea.style.padding = '32px 24px';
            uploadArea.style.border = '2px dashed var(--border-color)';
            uploadState.style.display = 'contents';
            
            startCameraBtn.innerHTML = '<i class="ph ph-video-camera"></i> Start Live Camera';
            startCameraBtn.style.borderColor = '';
            startCameraBtn.style.color = '';
            startCameraBtn.classList.remove('pulse-animation');
            
            startAnalysisBtn.innerHTML = '<i class="ph ph-play-circle"></i> Analyze Upload';
            if(!document.getElementById('fileInput').files.length) {
                startAnalysisBtn.disabled = true;
            } else {
                startAnalysisBtn.disabled = false;
            }
        }
    });

    async function captureAndAnalyzeFrame() {
        if (startCameraBtn.dataset.live !== 'true') return;
        
        const canvas = document.createElement('canvas');
        canvas.width = liveCameraFeed.videoWidth || 640;
        canvas.height = liveCameraFeed.videoHeight || 480;
        
        if (canvas.width > 0 && canvas.height > 0) {
            const ctx = canvas.getContext('2d');
            ctx.drawImage(liveCameraFeed, 0, 0, canvas.width, canvas.height);
            
            canvas.toBlob(async (blob) => {
                if (!blob) return;
                const formData = new FormData();
                formData.append('video', blob, 'frame.jpg');
                try {
                    const response = await fetch(`${BACKEND_URL}/analyze_video`, {
                        method: 'POST', body: formData
                    });
                    if (response.ok) {
                        const data = await response.json();
                        if (data.status === "success" && data.primary_hazard) {
                            updateObstacleUI(data.primary_hazard);
                        }
                    }
                } catch(e) { }
                
                if (startCameraBtn.dataset.live === 'true') {
                    setTimeout(captureAndAnalyzeFrame, 1500); // Analyze every 1.5s
                }
            }, 'image/jpeg', 0.8);
        } else {
            setTimeout(captureAndAnalyzeFrame, 500);
        }
    }
});
