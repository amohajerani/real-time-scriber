from functools import wraps
from flask import session, redirect, url_for
from werkzeug.security import generate_password_hash, check_password_hash
from config.mongodb import users


def login_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if 'user_id' not in session:
            return redirect(url_for('login'))
        return f(*args, **kwargs)
    return decorated_function


def register_user(username, password):
    # Check if username already exists
    if users.find_one({'username': username}):
        return False, "Username already exists"

    # Create new user
    hashed_password = generate_password_hash(password)
    users.insert_one({
        'username': username,
        'password': hashed_password
    })
    return True, "User registered successfully"


def verify_user(username, password):
    user = users.find_one({'username': username})
    if user and check_password_hash(user['password'], password):
        return True, user
    return False, None
