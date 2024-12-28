import logging
import os
from flask import Flask
from flask_socketio import SocketIO
from dotenv import load_dotenv
from deepgram import (
    DeepgramClient,
    LiveTranscriptionEvents,
    LiveOptions,
    DeepgramClientOptions
)
from openai import OpenAI
import json
from config.mongodb import recordings, prompts
from datetime import datetime
from flask import session

load_dotenv()

# Add this with other global variables
current_transcript = ""


def get_prompt(prompt_name='default_summary'):
    try:
        prompt = prompts.find_one({'name': prompt_name})
        if prompt:
            return prompt['content']
        # Fallback to first prompt if requested prompt not found
        fallback_prompt = prompts.find_one()
        return fallback_prompt['content'] if fallback_prompt else 'Error: No prompts available'
    except Exception as e:
        print(f'Error loading prompt: {e}')
        return 'Error loading prompt'


# Use this function when needed
llm_prompt = get_prompt()

app_socketio = Flask("app_socketio")
socketio = SocketIO(app_socketio, cors_allowed_origins=[
                    'http://127.0.0.1:8000'])

API_KEY = os.getenv("DEEPGRAM_API_KEY")
OPENAI_API_KEY = os.getenv("OPENAI_KEY")
print(OPENAI_API_KEY)
client = OpenAI(api_key=OPENAI_API_KEY)

# Set up client configuration
config = DeepgramClientOptions(
    verbose=logging.WARN,  # Change to logging.INFO or logging.DEBUG for more verbose output
    options={"keepalive": "true"}
)

deepgram = DeepgramClient(API_KEY, config)

dg_connection = None


def initialize_deepgram_connection():
    global dg_connection, current_transcript
    current_transcript = ""  # Reset transcript
    # Initialize Deepgram client and connection
    dg_connection = deepgram.listen.live.v("1")

    def on_open(self, open, **kwargs):
        print(f"\n\n{open}\n\n")

    def on_message(self, result, **kwargs):
        global current_transcript
        transcript = result.channel.alternatives[0].transcript
        if len(transcript) > 0:
            current_transcript += " " + transcript
            print(transcript)
            socketio.emit('transcription_update', {
                'transcription': transcript
            })

    def on_close(self, close, **kwargs):
        print(f"\n\n{close}\n\n")

    def on_error(self, error, **kwargs):
        print(f"\n\n{error}\n\n")

    dg_connection.on(LiveTranscriptionEvents.Open, on_open)
    dg_connection.on(LiveTranscriptionEvents.Transcript, on_message)
    dg_connection.on(LiveTranscriptionEvents.Close, on_close)
    dg_connection.on(LiveTranscriptionEvents.Error, on_error)

    # Define the options for the live transcription
    options = LiveOptions(model="nova-2", language="en-US")

    if dg_connection.start(options) is False:  # THIS CAUSES ERROR
        print("Failed to start connection")
        exit()


@socketio.on('audio_stream')
def handle_audio_stream(data):
    if dg_connection:
        dg_connection.send(data)


@socketio.on('toggle_transcription')
def handle_toggle_transcription(data):
    global current_transcript
    print("toggle_transcription", data)
    action = data.get("action")
    if action == "start":
        current_transcript = ""  # Reset transcript
        print("Starting Deepgram connection")
        initialize_deepgram_connection()


@socketio.on('connect')
def server_connect():
    print('Client connected')


@socketio.on('restart_deepgram')
def restart_deepgram():
    print('Restarting Deepgram connection')
    initialize_deepgram_connection()


@socketio.on('get_summary')
def handle_get_summary(data):
    transcript = data.get('transcript', '')
    prompt_name = data.get('promptType', 'default_summary')
    user_id = data.get('user_id')
    if not transcript:
        return

    try:
        # Get the selected prompt content
        prompt_content = get_prompt(prompt_name)
        response = client.chat.completions.create(
            model="gpt-3.5-turbo",
            messages=[
                {"role": "system", "content": prompt_content},
                {"role": "user", "content": transcript}
            ]
        )
        summary = response.choices[0].message.content

        # Store the recording in MongoDB
        recording_doc = {
            "transcript": transcript,
            "summary": summary,
            "prompt_type": prompt_name,
            "timestamp": datetime.utcnow(),
            "user_id": user_id,
            "patient_id": data.get('patient_id')
        }

        recordings.insert_one(recording_doc)

        recording_id = str(recording_doc['_id'])
        socketio.emit('recording_saved', {'recording_id': recording_id})

        socketio.emit('summary_ready', {'summary': summary})
    except Exception as e:
        print(f"Error processing summary: {e}")
        socketio.emit('summary_ready', {'summary': "Error generating summary"})


if __name__ == '__main__':
    logging.info("Starting SocketIO server.")
    socketio.run(app_socketio, debug=True,
                 allow_unsafe_werkzeug=True, port=5001)
