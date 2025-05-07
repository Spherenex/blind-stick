// Voice Navigation App for Visually Impaired Users - Updated version
document.addEventListener('DOMContentLoaded', function() {
    // DOM Elements
    const micButton = document.getElementById('micButton');
    const micStatus = document.getElementById('micStatus');
    const statusMessage = document.getElementById('statusMessage');
    const destination = document.getElementById('destination');
    const startButton = document.getElementById('startButton');
    const helperText = document.getElementById('helperText');
    const voiceCommands = document.getElementById('voiceCommands');
    const navigationSteps = document.getElementById('navigationSteps');
    const stepsContainer = document.getElementById('stepsContainer');
    const mapContainer = document.getElementById('mapContainer');
    const debugInfo = document.getElementById('debugInfo');
    const debugOutput = document.getElementById('debugOutput');
    const autoStartBanner = document.getElementById('autoStartBanner');
    
    // App State
    let userInteracted = false;
    let isListening = false;
    let isRecognitionActive = false;
    let isNavigating = false;
    let currentStep = 0;
    let directions = [];
    let userLocation = null;
    let map = null;
    let directionsService = null;
    let directionsRenderer = null;
    let recognition = null;
    let watchPositionId = null;
    let stepCoordinates = [];
    let lastAnnouncedStep = -1;
    
    // Speech Queue System
    const speechQueue = [];
    let isSpeaking = false;
    
    // Constants
    const API_KEY = 'AIzaSyCseX7e7t3cWnc5wq5NRkZtWtcnyG0QKD4'; // Your Google Maps API key
    const RECOGNITION_TIMEOUT = 7000; // 7 seconds before assuming no-speech
    let recognitionTimeout = null;
    
    // Debug mode
    const DEBUG_MODE = true;
    
    if (DEBUG_MODE) {
        debugInfo.classList.remove('hidden');
    }
    
    // Log to debug panel
    function debugLog(message) {
        if (DEBUG_MODE) {
            const timestamp = new Date().toLocaleTimeString();
            const logItem = document.createElement('div');
            logItem.textContent = `[${timestamp}] ${message}`;
            debugOutput.appendChild(logItem);
            // Scroll to bottom
            debugOutput.scrollTop = debugOutput.scrollHeight;
        }
    }
    
    // Initialize the application when the start button is clicked
    startButton.addEventListener('click', initializeApp);
    micButton.addEventListener('click', startListening);
    
    // IMPORTANT: Add click event listeners to the document to capture first user interaction
    document.addEventListener('click', function firstInteraction() {
        debugLog("First user interaction detected");
        if (!userInteracted) {
            initializeApp();
        }
        // Remove this event listener after first interaction
        document.removeEventListener('click', firstInteraction);
    }, { once: true });
    
    // Initialize the speech recognition
    function initializeSpeechRecognition() {
        try {
            // Check if speech recognition is supported
            if ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window) {
                const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
                recognition = new SpeechRecognition();
                recognition.continuous = false;
                recognition.interimResults = false;
                recognition.lang = 'en-US';
                
                recognition.onstart = function() {
                    debugLog("Recognition started");
                    isListening = true;
                    isRecognitionActive = true;
                    micButton.classList.add('active');
                    micStatus.textContent = 'Listening...';
                    
                    // Set timeout for no-speech error
                    clearTimeout(recognitionTimeout);
                    recognitionTimeout = setTimeout(() => {
                        if (isRecognitionActive) {
                            debugLog("No speech detected after timeout");
                            recognition.stop();
                        }
                    }, RECOGNITION_TIMEOUT);
                    
                    // Only speak if user has interacted and not currently speaking
                    if (userInteracted && !isSpeaking) {
                        addToSpeechQueue("I'm listening. Where would you like to go?");
                    }
                };
                
                recognition.onend = function() {
                    debugLog("Recognition ended");
                    isListening = false;
                    isRecognitionActive = false;
                    micButton.classList.remove('active');
                    micStatus.textContent = 'Tap to speak';
                    clearTimeout(recognitionTimeout);
                    
                    // Restart listening if not navigating and user has interacted
                    // Add a delay to prevent rapid restarts
                    if (!isNavigating && userInteracted) {
                        setTimeout(() => {
                            if (!isRecognitionActive && !isSpeaking) {
                                startListening();
                            }
                        }, 1000);
                    }
                };
                
                recognition.onresult = function(event) {
                    clearTimeout(recognitionTimeout);
                    debugLog("Recognition result received");
                    const transcript = event.results[0][0].transcript.toLowerCase();
                    statusMessage.textContent = `You said: ${transcript}`;
                    processVoiceCommand(transcript);
                };
                
                recognition.onerror = function(event) {
                    debugLog(`Recognition error: ${event.error}`);
                    
                    isListening = false;
                    isRecognitionActive = false;
                    micButton.classList.remove('active');
                    clearTimeout(recognitionTimeout);
                    
                    if (event.error === "no-speech") {
                        statusMessage.textContent = "No speech detected. Please try again.";
                        
                        if (userInteracted && !isSpeaking) {
                            addToSpeechQueue("I didn't hear anything. Please speak again.");
                        }
                    } else {
                        statusMessage.textContent = "Error: " + event.error;
                        
                        if (userInteracted && !isSpeaking) {
                            addToSpeechQueue("I encountered an error with voice recognition. Please try again.");
                        }
                    }
                    
                    // For no-speech errors, try to restart after a short delay
                    if (event.error === "no-speech" && !isNavigating && userInteracted) {
                        setTimeout(() => {
                            if (!isRecognitionActive && !isSpeaking) {
                                startListening();
                            }
                        }, 2000);
                    }
                };
                
                return true;
            } else {
                statusMessage.textContent = "Speech recognition not supported in this browser. Please use Chrome or Edge.";
                return false;
            }
        } catch (error) {
            debugLog(`Error initializing speech recognition: ${error}`);
            statusMessage.textContent = "Error initializing speech recognition. Please reload the page.";
            return false;
        }
    }
    
    // Initialize Google Maps
    function initMap() {
        try {
            debugLog("Initializing Google Maps");
            
            // Default to Bengaluru if location not available
            const defaultLocation = { lat: 12.9716, lng: 77.5946 };
            
            map = new google.maps.Map(document.getElementById('map'), {
                center: userLocation || defaultLocation,
                zoom: 13
            });
            
            directionsService = new google.maps.DirectionsService();
            directionsRenderer = new google.maps.DirectionsRenderer({
                map: map,
                suppressMarkers: false
            });
            
            // Add user location marker if available
            if (userLocation) {
                new google.maps.Marker({
                    position: userLocation,
                    map: map,
                    title: "Your Location",
                    icon: {
                        path: google.maps.SymbolPath.CIRCLE,
                        scale: 10,
                        fillColor: "#4285F4",
                        fillOpacity: 1,
                        strokeColor: "#ffffff",
                        strokeWeight: 2
                    }
                });
            }
            
            debugLog("Google Maps initialized successfully");
            return true;
        } catch (error) {
            debugLog(`Error initializing Google Maps: ${error}`);
            statusMessage.textContent = "Error initializing maps. Please reload the page.";
            return false;
        }
    }
    
    // Load Google Maps API dynamically
    function loadGoogleMapsAPI() {
        return new Promise((resolve, reject) => {
            debugLog("Loading Google Maps API");
            
            // Check if already loaded
            if (typeof google !== 'undefined' && typeof google.maps !== 'undefined') {
                debugLog("Google Maps API already loaded");
                resolve();
                return;
            }
            
            const script = document.createElement('script');
            script.src = `https://maps.googleapis.com/maps/api/js?key=${API_KEY}&callback=initMapCallback`;
            script.async = true;
            script.defer = true;
            
            // Define the callback function
            window.initMapCallback = function() {
                debugLog("Google Maps API loaded successfully");
                resolve();
            };
            
            // Handle loading errors
            script.onerror = function() {
                debugLog("Failed to load Google Maps API");
                reject(new Error("Failed to load Google Maps API"));
            };
            
            document.head.appendChild(script);
        });
    }
    
    // Initiate the application after user interaction
    function initializeApp() {
        if (!userInteracted) {
            userInteracted = true;
            statusMessage.textContent = "Starting voice navigation...";
            debugLog("Initializing application");
            
            // First, load Google Maps API
            loadGoogleMapsAPI()
                .then(() => {
                    // Initialize the map
                    if (initMap()) {
                        mapContainer.classList.remove('hidden');
                    }
                    
                    // Initialize speech recognition
                    if (initializeSpeechRecognition()) {
                        // Show voice commands
                        voiceCommands.classList.remove('hidden');
                        
                        // Test speech synthesis with user interaction already happened
                        // Use a small delay to ensure browser is ready
                        setTimeout(() => {
                            // Test that speech synthesis is working
                            testSpeechSynthesis(() => {
                                // Welcome message after confirming speech works
                                addToSpeechQueue("Welcome to voice navigation. Please say where you'd like to go.", () => {
                                    // Start listening after welcome message
                                    if (!isRecognitionActive) {
                                        startListening();
                                    }
                                });
                            });
                        }, 500);
                        
                        // Update UI
                        startButton.textContent = "Restart Voice Navigation";
                        helperText.textContent = "Speech recognition requires Chrome or Edge browser";
                        autoStartBanner.classList.remove('hidden');
                    }
                    
                    // Request user's location
                    requestUserLocation();
                })
                .catch(error => {
                    debugLog(`Initialization error: ${error}`);
                    statusMessage.textContent = "Error initializing application. Please reload the page.";
                });
        } else {
            // If already initialized, just start listening
            if (!isRecognitionActive && !isSpeaking) {
                startListening();
            }
        }
    }
    
    // Test that speech synthesis is working
    function testSpeechSynthesis(callback) {
        debugLog("Testing speech synthesis");
        
        if (!('speechSynthesis' in window)) {
            debugLog("Speech synthesis not supported");
            statusMessage.textContent += " Speech output not supported in this browser.";
            if (callback) callback();
            return;
        }
        
        // Try a very short utterance to test
        const testUtterance = new SpeechSynthesisUtterance("test");
        testUtterance.volume = 0.1; // Very quiet test
        
        testUtterance.onend = function() {
            debugLog("Speech synthesis test successful");
            if (callback) callback();
        };
        
        testUtterance.onerror = function(event) {
            debugLog(`Speech synthesis test failed: ${event.error}`);
            statusMessage.textContent += " Speech output error. Please try again.";
            if (callback) callback();
        };
        
        // If the event doesn't fire for some reason, ensure the callback still runs
        setTimeout(() => {
            if (callback) callback();
        }, 1000);
        
        // Start the test
        try {
            speechSynthesis.speak(testUtterance);
        } catch (error) {
            debugLog(`Error in speech synthesis test: ${error}`);
            if (callback) callback();
        }
    }
    
    // Request user's location
    function requestUserLocation() {
        if (navigator.geolocation) {
            debugLog("Requesting user location");
            
            navigator.geolocation.getCurrentPosition(
                function(position) {
                    userLocation = {
                        lat: position.coords.latitude,
                        lng: position.coords.longitude
                    };
                    
                    debugLog(`User location obtained: ${userLocation.lat}, ${userLocation.lng}`);
                    
                    if (map) {
                        map.setCenter(userLocation);
                        
                        // Add a marker for the user's location
                        new google.maps.Marker({
                            position: userLocation,
                            map: map,
                            title: "Your Location",
                            icon: {
                                path: google.maps.SymbolPath.CIRCLE,
                                scale: 10,
                                fillColor: "#4285F4",
                                fillOpacity: 1,
                                strokeColor: "#ffffff",
                                strokeWeight: 2
                            }
                        });
                    }
                    
                    addToSpeechQueue("I've accessed your location. Where would you like to go?");
                },
                function(error) {
                    debugLog(`Geolocation error: ${error.code} - ${error.message}`);
                    statusMessage.textContent = "Error accessing your location. Please enable location services.";
                    addToSpeechQueue("I couldn't access your location. Please enable location services and reload the page.");
                },
                {
                    enableHighAccuracy: true,
                    timeout: 10000,
                    maximumAge: 0
                }
            );
        } else {
            debugLog("Geolocation not supported");
            statusMessage.textContent = "Geolocation is not supported by this browser";
            addToSpeechQueue("Location services are not supported in your browser. Please try using a different browser.");
        }
    }
    
    // Add to speech queue
    function addToSpeechQueue(text, callback) {
        speechQueue.push({
            text: text,
            callback: callback
        });
        
        // If not currently speaking, start the queue
        if (!isSpeaking) {
            processNextInSpeechQueue();
        }
    }
    
    // Process next item in speech queue
    function processNextInSpeechQueue() {
        if (speechQueue.length === 0) {
            isSpeaking = false;
            return;
        }
        
        isSpeaking = true;
        const currentSpeech = speechQueue.shift();
        speak(currentSpeech.text, currentSpeech.callback);
    }
    
    // Function to speak text with improved error handling
    function speak(text, callback) {
        debugLog(`Speaking: "${text}"`);
        
        // Check if speech synthesis is supported
        if (!('speechSynthesis' in window)) {
            debugLog("Speech synthesis not supported");
            isSpeaking = false;
            if (callback) callback();
            processNextInSpeechQueue();
            return;
        }
        
        // Always cancel any ongoing speech before starting new speech
        speechSynthesis.cancel();
        
        // Create a new utterance for each speech to avoid issues
        const newUtterance = new SpeechSynthesisUtterance(text);
        newUtterance.rate = 1;
        newUtterance.pitch = 1;
        newUtterance.volume = 1;
        
        // Add error handling for speech synthesis
        newUtterance.onerror = function(event) {
            debugLog(`Speech synthesis error: ${event.error}`);
            
            // Continue the flow even if there's an error
            isSpeaking = false;
            if (callback) callback();
            processNextInSpeechQueue();
        };
        
        // Handle speech completion
        newUtterance.onend = function() {
            debugLog("Speech completed");
            isSpeaking = false;
            if (callback) callback();
            processNextInSpeechQueue();
        };
        
        // Speak the text
        try {
            speechSynthesis.speak(newUtterance);
            
            // Safety timeout in case onend doesn't fire
            setTimeout(() => {
                if (isSpeaking) {
                    debugLog("Speech timeout - forcing continuation");
                    isSpeaking = false;
                    if (callback) callback();
                    processNextInSpeechQueue();
                }
            }, text.length * 100); // Rough estimate: 100ms per character
        } catch (error) {
            debugLog(`Error speaking: ${error}`);
            isSpeaking = false;
            if (callback) callback();
            processNextInSpeechQueue();
        }
    }
    
    // Start listening for voice commands
    function startListening() {
        if (recognition && !isRecognitionActive) {
            try {
                debugLog("Starting speech recognition");
                recognition.start();
            } catch (error) {
                debugLog(`Error starting speech recognition: ${error}`);
                isRecognitionActive = false;
                
                // Add a short delay before trying again
                setTimeout(function() {
                    if (!isRecognitionActive) {
                        try {
                            debugLog("Retrying speech recognition");
                            recognition.start();
                        } catch (innerError) {
                            debugLog(`Second attempt to start recognition failed: ${innerError}`);
                            statusMessage.textContent = "Failed to start speech recognition. Please reload the page and try again.";
                        }
                    }
                }, 300);
            }
        } else if (isRecognitionActive) {
            debugLog("Speech recognition is already active, not starting again");
        }
    }
    
    // Process voice commands
    function processVoiceCommand(command) {
        debugLog(`Processing command: "${command}"`);
        
        // Check for navigation commands
        if (command.includes("navigate to") || command.includes("take me to") || command.includes("go to")) {
            // Extract destination from command
            let dest = "";
            if (command.includes("navigate to")) {
                dest = command.split("navigate to ")[1];
            } else if (command.includes("take me to")) {
                dest = command.split("take me to ")[1];
            } else if (command.includes("go to")) {
                dest = command.split("go to ")[1];
            }
            
            if (dest) {
                debugLog(`Destination extracted: "${dest}"`);
                destination.textContent = `Destination: ${dest}`;
                statusMessage.textContent = `Getting directions to ${dest}...`;
                addToSpeechQueue(`Finding directions to ${dest}`);
                
                if (userLocation) {
                    getDirectionsFromAPI(userLocation, dest);
                } else {
                    addToSpeechQueue("I need your location to provide directions. Please enable location services and try again.");
                    statusMessage.textContent = "Location access required for navigation";
                }
            }
        } else if (command.includes("stop") || command.includes("cancel")) {
            // Stop navigation
            debugLog("Stopping navigation");
            isNavigating = false;
            directions = [];
            currentStep = 0;
            statusMessage.textContent = "Navigation stopped";
            destination.textContent = "";
            stepsContainer.innerHTML = "";
            navigationSteps.classList.add('hidden');
            
            // Stop location tracking
            if (watchPositionId !== null) {
                navigator.geolocation.clearWatch(watchPositionId);
                watchPositionId = null;
            }
            
            // Clear the map
            if (directionsRenderer) {
                directionsRenderer.setDirections({routes: []});
            }
            
            addToSpeechQueue("Navigation stopped. Where would you like to go next?");
        } else if (command.includes("repeat")) {
            // Repeat current direction
            debugLog("Repeating current direction");
            if (directions.length > 0 && currentStep < directions.length) {
                speakManualStep(currentStep);
            } else {
                addToSpeechQueue("No active navigation. Where would you like to go?");
            }
        } else if (command.includes("next step") || command.includes("next instruction")) {
            // Manually go to next step
            if (directions.length > 0 && currentStep < directions.length - 1) {
                currentStep++;
                speakManualStep(currentStep);
                updateActiveStep();
            } else {
                addToSpeechQueue("You have reached the end of the navigation steps.");
            }
        } else if (command.includes("previous step") || command.includes("previous instruction") || command.includes("go back")) {
            // Manually go to previous step
            if (directions.length > 0 && currentStep > 0) {
                currentStep--;
                speakManualStep(currentStep);
                updateActiveStep();
            } else {
                addToSpeechQueue("You are at the beginning of the navigation steps.");
            }
        } else {
            // Assume the command is a destination
            const dest = command;
            debugLog(`Using entire command as destination: "${dest}"`);
            destination.textContent = `Destination: ${dest}`;
            statusMessage.textContent = `Getting directions to ${dest}...`;
            addToSpeechQueue(`Finding directions to ${dest}`);
            
            if (userLocation) {
                getDirectionsFromAPI(userLocation, dest);
            } else {
                addToSpeechQueue("I need your location to provide directions. Please enable location services and try again.");
                statusMessage.textContent = "Location access required for navigation";
            }
        }
    }
    
    // Get directions from Google Maps API
    function getDirectionsFromAPI(origin, destination) {
        if (!directionsService) {
            debugLog("Directions service not initialized");
            addToSpeechQueue("Map service is not yet initialized. Please try again in a moment.");
            return;
        }
        
        debugLog(`Getting directions from ${JSON.stringify(origin)} to ${destination}`);
        
        directionsService.route(
            {
                origin: origin,
                destination: destination,
                travelMode: google.maps.TravelMode.WALKING
            },
            function(response, status) {
                if (status === "OK") {
                    debugLog("Directions received successfully");
                    // Process the response
                    processDirections(response);
                    
                    // Display the route on the map
                    directionsRenderer.setDirections(response);
                } else {
                    debugLog(`Failed to get directions: ${status}`);
                    addToSpeechQueue("Sorry, I couldn't find directions to that location. Please try another destination.");
                    statusMessage.textContent = "Directions not found: " + status;
                }
            }
        );
    }
    
    // Process directions from Google Maps API
    function processDirections(response) {
        try {
            debugLog("Processing directions response");
            const route = response.routes[0];
            const legs = route.legs[0];
            const steps = legs.steps;
            
            // Format directions for voice navigation
            directions = [
                { instruction: `Starting navigation to ${legs.end_address}. Total distance: ${legs.distance.text}, estimated time: ${legs.duration.text}.` }
            ];
            
            // Process each step for voice instructions
            steps.forEach(function(step, index) {
                // Convert HTML instructions to plain text
                let instruction = step.instructions.replace(/<[^>]*>/g, "");
                
                // Enhance instruction with clear distance and turn information
                // Check if the next instruction involves a turn or direction change
                let enhancedInstruction = "";
                const distance = step.distance.text;
                
                // Look for common direction words in the instruction
                const hasRight = instruction.toLowerCase().includes("right");
                const hasLeft = instruction.toLowerCase().includes("left");
                const hasTurn = instruction.toLowerCase().includes("turn");
                const hasOnto = instruction.toLowerCase().includes("onto");
                const hasContinue = instruction.toLowerCase().includes("continue");
                
                // Format the instruction to clearly state distance and direction
                if (hasRight || hasLeft) {
                    // This is a turn instruction
                    const direction = hasRight ? "right" : "left";
                    
                    if (hasTurn) {
                        enhancedInstruction = `Travel for ${distance}, then turn ${direction}`;
                        
                        // Add street name if available
                        if (hasOnto) {
                            const streetName = instruction.split("onto ")[1];
                            if (streetName) {
                                enhancedInstruction += ` onto ${streetName}`;
                            }
                        }
                    } else {
                        enhancedInstruction = `Continue for ${distance}, then ${instruction}`;
                    }
                } else if (hasContinue) {
                    // This is a "continue straight" type instruction
                    enhancedInstruction = `Continue straight for ${distance}`;
                    
                    // Add street name if available
                    if (hasOnto) {
                        const streetName = instruction.split("onto ")[1];
                        if (streetName) {
                            enhancedInstruction += ` onto ${streetName}`;
                        }
                    }
                } else {
                    // Use the original instruction but add the distance first
                    enhancedInstruction = `Travel for ${distance}, then ${instruction}`;
                }
                
                directions.push({
                    instruction: enhancedInstruction,
                    originalInstruction: instruction,
                    distance: step.distance.text,
                    duration: step.duration.text,
                    // Store step location data
                    location: {
                        lat: step.start_location.lat(),
                        lng: step.start_location.lng()
                    }
                });
                
                debugLog(`Step ${index + 1}: ${enhancedInstruction}`);
            });
            
            // Add final message
            directions.push({
                instruction: `You have arrived at your destination: ${legs.end_address}`,
                location: {
                    lat: legs.end_location.lat(),
                    lng: legs.end_location.lng()
                }
            });
            
            // Display directions in the UI
            displayDirections();
            
            // Start navigation
            isNavigating = true;
            currentStep = 0;
            lastAnnouncedStep = -1;
            
            // Only speak the first direction
            addToSpeechQueue("Navigation started. " + directions[0].instruction);
            
            // Update UI to show active step
            updateActiveStep();
            
            // Start location tracking
            startLocationTracking();
            
        } catch (error) {
            debugLog(`Error processing directions: ${error}`);
            addToSpeechQueue("Sorry, I encountered an error processing the directions. Please try again.");
            statusMessage.textContent = "Error processing directions";
        }
    }
    
    // Display directions in the UI
    function displayDirections() {
        debugLog("Displaying directions in UI");
        stepsContainer.innerHTML = "";
        
        directions.forEach(function(direction, index) {
            const stepElement = document.createElement("div");
            stepElement.className = "step";
            stepElement.id = `step-${index}`;
            
            // For steps with distance and duration info
            if (direction.distance && direction.duration) {
                stepElement.innerHTML = `
                    <p>${direction.instruction}</p>
                    <small>${direction.distance} - approx. ${direction.duration}</small>
                `;
            } else {
                stepElement.innerHTML = `<p>${direction.instruction}</p>`;
            }
            
            stepsContainer.appendChild(stepElement);
        });
        
        navigationSteps.classList.remove('hidden');
        
        // Set up click handlers for steps
        setupStepClickHandlers();
    }
    
    // Setup click handlers for navigation steps
    function setupStepClickHandlers() {
        const steps = document.querySelectorAll('.step');
        steps.forEach((step, index) => {
            step.addEventListener('click', () => {
                debugLog(`Step ${index} clicked manually`);
                // Set current step to the clicked one
                currentStep = index;
                // Speak just this step
                speakManualStep(index);
                // Update UI to show active step
                updateActiveStep();
            });
            // Make it look clickable
            step.style.cursor = 'pointer';
        });
    }
    
    // Update which step is visually active
    function updateActiveStep() {
        const allSteps = document.querySelectorAll('.step');
        allSteps.forEach(step => step.classList.remove('active'));
        
        const currentStepElement = document.getElementById(`step-${currentStep}`);
        if (currentStepElement) {
            currentStepElement.classList.add('active');
            currentStepElement.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
    }
    
    // Function to speak just the manually selected step
    function speakManualStep(stepIndex) {
        if (directions[stepIndex]) {
            // Cancel any current speech
            if ('speechSynthesis' in window) {
                speechSynthesis.cancel();
            }
            
            // Prepare a more useful announcement with context about which step this is
            let announcement = directions[stepIndex].instruction;
            
            // Add context about where in the journey the user is
            if (stepIndex > 0 && stepIndex < directions.length - 1) {
                // Add step number information for steps between first and last
                announcement = `Step ${stepIndex} of ${directions.length - 1}: ${announcement}`;
            }
            
            // Add distance to next step if not the last step
            if (stepIndex < directions.length - 1 && directions[stepIndex + 1].distance) {
                announcement += `. After this, in ${directions[stepIndex + 1].distance}, ${directions[stepIndex + 1].originalInstruction || directions[stepIndex + 1].instruction}`;
            }
            
            // Speak the enhanced instruction
            addToSpeechQueue(announcement);
            
            // Update status message
            statusMessage.textContent = "Current step: " + directions[stepIndex].instruction;
        }
    }
    
    // Start location tracking
    function startLocationTracking() {
        if (navigator.geolocation && isNavigating) {
            debugLog("Starting location tracking");
            
            // Extract coordinates for each step
            extractStepCoordinates();
            
            // Start watching position
            watchPositionId = navigator.geolocation.watchPosition(
                function(position) {
                    const currentPosition = {
                        lat: position.coords.latitude,
                        lng: position.coords.longitude
                    };
                    
                    // Check if we're close to any of the step points
                    checkProximityToSteps(currentPosition);
                },
                function(error) {
                    debugLog(`Geolocation tracking error: ${error.code} - ${error.message}`);
                },
                {
                    enableHighAccuracy: true,
                    maximumAge: 0,
                    timeout: 5000
                }
            );
        }
    }
    
    // Function to extract coordinates from each step
    function extractStepCoordinates() {
        stepCoordinates = [];
        
        // For each step, get its location
        directions.forEach((direction, index) => {
            if (direction.location) {
                stepCoordinates.push(direction.location);
            } else if (index === 0) {
                // Starting point is user's location
                stepCoordinates.push(userLocation);
            }
        });
        
        debugLog(`Extracted ${stepCoordinates.length} step coordinates`);
    }
    
    // Function to check if user is close to any step point
    function checkProximityToSteps(currentPosition) {
        for (let i = lastAnnouncedStep + 1; i < stepCoordinates.length; i++) {
            const stepPosition = stepCoordinates[i];
            
            // Calculate distance between current position and step
            const distance = calculateDistance(
                currentPosition.lat, currentPosition.lng,
                stepPosition.lat, stepPosition.lng
            );
            
            // If within proximity threshold (e.g., 20 meters)
            if (distance < 0.02) {  // 0.02 km = 20 meters
                debugLog(`User has reached step ${i}, distance: ${distance.toFixed(4)}km`);
                
                // Update current step
                currentStep = i;
                
                // Announce this step
                speakManualStep(i);
                
                // Update UI to show active step
                updateActiveStep();
                
                // Remember this step was announced
                lastAnnouncedStep = i;
                
                // Only announce one step at a time
                break;
            }
            // If approaching the next instruction but not quite there
            // Give an early warning when getting close (e.g., within 50 meters)
            else if (distance < 0.05 && distance >= 0.02 && i === lastAnnouncedStep + 1) {
                // Only announce the approaching step if we haven't recently announced it
                const now = Date.now();
                if (!window.lastApproachingAnnouncement || now - window.lastApproachingAnnouncement > 30000) { // 30 second cooldown
                    window.lastApproachingAnnouncement = now;
                    
                    // Convert distance to meters for more precise guidance
                    const distanceMeters = Math.round(distance * 1000);
                    
                    // Prepare approaching announcement
                    const approachingMsg = `In ${distanceMeters} meters, ${directions[i].instruction}`;
                    
                    // Announce approaching step
                    addToSpeechQueue(approachingMsg);
                    
                    debugLog(`Approaching step ${i}, distance: ${distance.toFixed(4)}km`);
                }
            }
        }
    }
    
    // Function to calculate distance between two points using Haversine formula
    function calculateDistance(lat1, lon1, lat2, lon2) {
        const R = 6371; // Radius of the Earth in km
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLon = (lon2 - lon1) * Math.PI / 180;
        const a = 
            Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
            Math.sin(dLon/2) * Math.sin(dLon/2); 
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)); 
        const distance = R * c; // Distance in km
        return distance;
    }
    
    // Display initial instructions to encourage user interaction
    statusMessage.textContent = "Click anywhere on the page to start voice navigation";
    helperText.textContent = "Click the 'Start Voice Navigation' button or anywhere on the page";
    
    // Alert users that interaction is needed for voice features
    const alertMessage = document.createElement('div');
    alertMessage.className = 'voice-alert';
    alertMessage.textContent = "Due to browser security, please click anywhere on the page to enable voice features";
    document.querySelector('.container').prepend(alertMessage);
    
    // Pre-load Google Maps API
    loadGoogleMapsAPI()
        .then(() => {
            debugLog("Maps API pre-loaded, waiting for user interaction");
        })
        .catch(error => {
            debugLog(`Error pre-loading Maps API: ${error}`);
        });
});