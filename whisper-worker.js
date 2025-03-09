// Web Worker for handling Whisper model operations

// Import Transformers.js
importScripts('https://cdn.jsdelivr.net/npm/@xenova/transformers@2.5.0');

let whisperPipeline = null;
let modelLoaded = false;
let isProcessing = false;

// Access the Transformers module
const { pipeline, env } = Transformers;

// Limit CPU usage and disable progress bars
env.useBrowserCache = true;
env.allowLocalModels = false;

// Handle messages from the main thread
self.onmessage = async function(e) {
    const { command, data } = e.data;
    
    switch (command) {
        case 'loadModel':
            try {
                if (isProcessing) {
                    self.postMessage({
                        command: 'modelLoaded',
                        success: false,
                        error: 'Model is currently being loaded or processing audio'
                    });
                    return;
                }
                
                isProcessing = true;
                const { modelSize } = data;
                
                // Send progress updates
                self.postMessage({
                    command: 'progress',
                    result: { status: 'Initializing Whisper model...' }
                });
                
                await loadModel(modelSize);
                
                isProcessing = false;
                self.postMessage({
                    command: 'modelLoaded',
                    success: true
                });
            } catch (error) {
                isProcessing = false;
                console.error('Error loading model:', error);
                self.postMessage({
                    command: 'modelLoaded',
                    success: false,
                    error: error.message || 'Unknown error loading model'
                });
            }
            break;
            
        case 'transcribe':
            try {
                if (!modelLoaded) {
                    self.postMessage({
                        command: 'transcriptionResult',
                        success: false,
                        error: 'Model not loaded'
                    });
                    return;
                }
                
                if (isProcessing) {
                    self.postMessage({
                        command: 'transcriptionResult',
                        success: false,
                        error: 'Already processing audio'
                    });
                    return;
                }
                
                isProcessing = true;
                const { audioData, language } = data;
                
                self.postMessage({
                    command: 'progress',
                    result: { status: 'Processing audio...' }
                });
                
                const result = await transcribeAudio(audioData, language);
                
                isProcessing = false;
                self.postMessage({
                    command: 'transcriptionResult',
                    success: true,
                    result
                });
            } catch (error) {
                isProcessing = false;
                console.error('Transcription error:', error);
                self.postMessage({
                    command: 'transcriptionResult',
                    success: false,
                    error: error.message || 'Unknown transcription error'
                });
            }
            break;
    }
};

// Load the Whisper model using Transformers.js
async function loadModel(modelSize) {
    try {
        // Choose appropriate model based on size
        const model_name = `Xenova/whisper-${modelSize}`;
        
        // Update status
        self.postMessage({
            command: 'progress',
            result: { status: `Loading ${model_name}...` }
        });
        
        // Create pipeline
        whisperPipeline = await pipeline('automatic-speech-recognition', model_name, {
            quantized: true, // Use quantized model for better performance
            chunk_length_s: 30, // Process 30 seconds of audio at a time
            stride_length_s: 5  // Overlap between chunks
        });
        
        modelLoaded = true;
        
        return true;
    } catch (error) {
        console.error("Error in loadModel:", error);
        throw error;
    }
}

// Convert audio array buffer to format needed by model
async function prepareAudioData(arrayBuffer) {
    // Create audio context
    const audioContext = new OfflineAudioContext({
        numberOfChannels: 1,
        length: 16000 * 10, // 10 seconds at 16kHz
        sampleRate: 16000,
    });

    // Decode audio data
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
    
    // Get audio data as Float32Array
    const audioData = audioBuffer.getChannelData(0);
    
    return audioData;
}

// Transcribe audio using the Whisper model
async function transcribeAudio(audioArrayBuffer, language) {
    try {
        // Convert array buffer to audio data
        const audioData = await prepareAudioData(audioArrayBuffer);
        
        const options = {};
        if (language) {
            options.language = language;
        }
        
        self.postMessage({
            command: 'progress',
            result: { status: 'Running transcription...' }
        });

        // Run transcription
        const result = await whisperPipeline(audioData, options);
        
        return {
            text: result.text || "No transcription available."
        };
    } catch (error) {
        console.error("Error in transcribeAudio:", error);
        throw error;
    }
}

// Notify main thread that worker is ready
self.postMessage({
    command: 'progress',
    result: { status: 'Worker initialized and ready' }
});
