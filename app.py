import logging

from dotenv import load_dotenv
from flask import Flask, render_template, jsonify
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


if __name__ == '__main__':
    logging.info("Starting Flask server.")
    # Run flask app
    app.run(debug=True, port=8000)
