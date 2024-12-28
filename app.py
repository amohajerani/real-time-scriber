import logging

from dotenv import load_dotenv
from flask import Flask, render_template, jsonify, request
import json
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


if __name__ == '__main__':
    logging.info("Starting Flask server.")
    # Run flask app
    app.run(debug=True, port=8000)
