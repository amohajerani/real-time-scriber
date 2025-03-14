import logging
import os

from dotenv import load_dotenv
from flask import Flask, render_template, jsonify, request, session, redirect, url_for
import json
from config.mongodb import recordings, prompts, patients
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


@app.route('/get_user_recordings')
@login_required
def get_user_recordings():
    try:
        user_id = session.get('user_id')
        patient_id = request.args.get('patient_id')

        query = {"user_id": user_id}
        if patient_id:
            query["patient_id"] = patient_id

        user_recordings = list(recordings.find(
            query,
            {'transcript': 1, 'summary': 1, 'timestamp': 1, 'prompt_type': 1}
        ).sort('timestamp', -1))

        # Convert ObjectId to string and format timestamp
        for record in user_recordings:
            record['_id'] = str(record['_id'])
            record['timestamp'] = record['timestamp'].strftime(
                '%Y-%m-%d %H:%M:%S')

        return jsonify({
            'success': True,
            'recordings': user_recordings
        })
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        })


@app.route('/get_patients')
@login_required
def get_patients():
    try:
        user_id = session.get('user_id')
        patient_list = list(patients.find(
            {"user_id": user_id},
            {'firstName': 1, 'lastName': 1, 'notes': 1}
        ))
        for patient in patient_list:
            patient['_id'] = str(patient['_id'])
        return jsonify({'success': True, 'patients': patient_list})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})


@app.route('/add_patient', methods=['POST'])
@login_required
def add_patient():
    try:
        data = request.json
        user_id = session.get('user_id')

        new_patient = {
            "firstName": data.get('firstName'),
            "lastName": data.get('lastName'),
            "notes": data.get('notes'),
            "user_id": user_id,
            "created_at": datetime.utcnow()
        }

        result = patients.insert_one(new_patient)
        new_patient['_id'] = str(result.inserted_id)

        return jsonify({'success': True, 'patient': new_patient})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})


@app.route('/update_patient_notes', methods=['POST'])
@login_required
def update_patient_notes():
    try:
        data = request.json
        patient_id = data.get('patient_id')
        notes = data.get('notes')

        if not patient_id:
            return jsonify({'success': False, 'error': 'Patient ID is required'})

        result = patients.update_one(
            {'_id': ObjectId(patient_id)},
            {'$set': {'notes': notes}}
        )

        return jsonify({
            'success': True if result.modified_count > 0 else False
        })
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})


if __name__ == '__main__':
    port = int(os.environ.get('PORT', 8000))
    app.run(host='0.0.0.0', port=port)
