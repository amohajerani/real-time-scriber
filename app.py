import logging

from dotenv import load_dotenv
from flask import Flask, render_template, jsonify, request
import json
from config.mongodb import recordings
from bson import ObjectId
from datetime import datetime
load_dotenv()

app = Flask("app_http")


@app.route('/')
def index():
    return render_template('index.html')


@app.route('/get_prompts')
def get_prompts():
    try:
        with open('prompts.json', 'r') as file:
            prompts = json.load(file)
            return jsonify(prompts)
    except Exception as e:
        return {'error': 'Error loading prompts: ' + str(e)}


@app.route('/update_prompt', methods=['POST'])
def update_prompt():
    try:
        data = request.json
        prompt_name = data.get('name')
        new_content = data.get('content')

        with open('prompts.json', 'r') as file:
            prompts_data = json.load(file)

        # Find and update the prompt
        for prompt in prompts_data['prompts']:
            if prompt['name'] == prompt_name:
                prompt['content'] = new_content
                break

        # Save the updated prompts
        with open('prompts.json', 'w') as file:
            json.dump(prompts_data, file, indent=2)

        return jsonify({'success': True})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})


@app.route('/create_prompt', methods=['POST'])
def create_prompt():
    try:
        data = request.json
        prompt_name = data.get('name')
        content = data.get('content')

        if not prompt_name or not content:
            return jsonify({'success': False, 'error': 'Name and content are required'})

        with open('prompts.json', 'r') as file:
            prompts_data = json.load(file)

        # Check if prompt name already exists
        if any(prompt['name'] == prompt_name for prompt in prompts_data['prompts']):
            return jsonify({'success': False, 'error': 'Prompt name already exists'})

        # Add new prompt
        prompts_data['prompts'].append({
            'name': prompt_name,
            'content': content
        })

        # Save updated prompts
        with open('prompts.json', 'w') as file:
            json.dump(prompts_data, file, indent=2)

        return jsonify({'success': True})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})


@app.route('/recordings')
def get_recordings():
    try:
        # Retrieve the last 10 recordings, sorted by timestamp
        recent_recordings = list(recordings.find(
            {},
            {'_id': 0}  # Exclude MongoDB _id from results
        ).sort('timestamp', -1).limit(10))

        return jsonify({
            'success': True,
            'recordings': recent_recordings
        })
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        })


@app.route('/save_edits', methods=['POST'])
def save_edits():
    try:
        data = request.json
        recording_id = data.get('recording_id')
        edit_type = data.get('type')

        update_data = {}
        if edit_type == 'transcript':
            update_data['transcript'] = data.get('transcript')
        elif edit_type == 'summary':
            update_data['summary'] = data.get('summary')

        # Add edit history
        update_data[f'{edit_type}_edit_history'] = {
            'content': update_data[edit_type],
            'timestamp': datetime.utcnow()
        }

        result = recordings.update_one(
            {'_id': ObjectId(recording_id)},
            {
                '$set': update_data,
                '$push': {f'{edit_type}_edits': update_data[f'{edit_type}_edit_history']}
            }
        )

        return jsonify({
            'success': True if result.modified_count > 0 else False
        })
    except Exception as e:
        print(f"Error saving edits: {e}")
        return jsonify({'success': False, 'error': str(e)})


if __name__ == '__main__':
    logging.info("Starting Flask server.")
    # Run flask app
    app.run(debug=True, port=8000)
