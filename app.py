import logging

from dotenv import load_dotenv
from flask import Flask, render_template, jsonify, request, session, redirect, url_for
import json
from config.mongodb import recordings, prompts
from bson import ObjectId
from datetime import datetime
from auth import login_required, register_user, verify_user
import secrets
load_dotenv()

app = Flask("app_http")
app.secret_key = secrets.token_hex(16)  # Required for session management


@app.route('/')
@login_required
def index():
    return render_template('index.html')


@app.route('/get_prompts')
@login_required
def get_prompts():
    try:
        prompts_list = list(prompts.find({}, {'_id': 0}))
        return jsonify({'prompts': prompts_list})
    except Exception as e:
        return {'error': 'Error loading prompts: ' + str(e)}


@app.route('/update_prompt', methods=['POST'])
@login_required
def update_prompt():
    try:
        data = request.json
        prompt_name = data.get('name')
        new_content = data.get('content')

        result = prompts.update_one(
            {'name': prompt_name},
            {'$set': {'content': new_content}}
        )

        if result.modified_count > 0:
            return jsonify({'success': True})
        else:
            return jsonify({'success': False, 'error': 'Prompt not found'})
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

        # Check if prompt name already exists
        existing_prompt = prompts.find_one({'name': prompt_name})
        if existing_prompt:
            return jsonify({'success': False, 'error': 'Prompt name already exists'})

        # Add new prompt
        prompts.insert_one({
            'name': prompt_name,
            'content': content
        })

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


@app.route('/login', methods=['GET', 'POST'])
def login():
    if request.method == 'POST':
        username = request.form.get('username')
        password = request.form.get('password')

        success, user = verify_user(username, password)
        if success:
            session['user_id'] = str(user['_id'])
            return redirect(url_for('index'))
        return render_template('login.html', error="Invalid credentials")

    return render_template('login.html')


@app.route('/register', methods=['GET', 'POST'])
def register():
    if request.method == 'POST':
        username = request.form.get('username')
        password = request.form.get('password')

        success, message = register_user(username, password)
        if success:
            return redirect(url_for('login'))
        return render_template('register.html', error=message)

    return render_template('register.html')


@app.route('/logout')
def logout():
    session.clear()
    return redirect(url_for('login'))


if __name__ == '__main__':
    logging.info("Starting Flask server.")
    # Run flask app
    app.run(debug=True, port=8000)
