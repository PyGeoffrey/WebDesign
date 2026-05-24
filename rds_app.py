"""
RDS Best Practices Demo
Demonstrates proper patterns for interacting with Amazon RDS (MySQL)
"""

import pymysql
from pymysql.cursors import DictCursor
from contextlib import contextmanager
from datetime import datetime
from config import DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME
from fastapi import FastAPI
app = FastAPI()

# Build connection params on demand so functions don't need `self`.
def _connection_params():
    return {
        'host': DB_HOST,
        'port': DB_PORT,
        'user': DB_USER,
        'password': DB_PASSWORD,
        'database': DB_NAME,
        'cursorclass': DictCursor,
        'autocommit': False,
    }


@contextmanager
def get_connection():
    conn = pymysql.connect(**_connection_params())
    try:
        yield conn
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def setup_tables():
    with get_connection() as conn:
        cursor = conn.cursor()
        try:
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS users (
                    user_id INTEGER PRIMARY KEY AUTO_INCREMENT,
                    email VARCHAR(100) UNIQUE NOT NULL,
                    realname VARCHAR(100),
                    username VARCHAR(50),
                    password TEXT
                );
            """)
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS scoretables (
                    id INTEGER PRIMARY KEY AUTO_INCREMENT,
                    username VARCHAR(50),
                    results JSON
                );
            """)
            conn.commit()
            print("Success - Created tables")
        except pymysql.Error as e:
            print("Error", e.args[0], "-", e.args[1])


def insert_data(username, score, qar):
    with get_connection() as conn:
        cursor = conn.cursor()
        try:
            newJSON = {
                "Time Completed": datetime.now().strftime("%Y-%m-%d %H:%M:%S") + " " + datetime.now().astimezone().tzname(),
                "Score": score,
                "Questions/Results": qar,
            }
            cursor.execute(
                "INSERT INTO scoretables (username, results) VALUES (%s, %s);",
                (username, newJSON),
            )
            conn.commit()
            print("Success - Inserted data")
            return newJSON
        except pymysql.Error as e:
            print("Error", e.args[0], "-", e.args[1])


def new_user(em, rn, un, pw):
    with get_connection() as conn:
        cursor = conn.cursor()
        try:
            cursor.execute("SELECT * FROM users WHERE email = %s;", (em,))
            if not cursor.fetchone():
                cursor.execute(
                    "INSERT INTO users (email, realname, username, password) VALUES (%s, %s, %s, %s);",
                    (em, rn, un, pw),
                )
                conn.commit()
                print("Success - Created new user")
            else:
                print("Error - User already exists")
        except pymysql.Error as e:
            print("Error", e.args[0], "-", e.args[1])


def authuser(em, pw):
    with get_connection() as conn:
        cursor = conn.cursor()
        try:
            cursor.execute(
                "SELECT * FROM users WHERE email = %s AND password = %s;",
                (em, pw),
            )
            result = cursor.fetchone()
            if result:
                print("Success - Authenticated user")
                return result['realname']
            else:
                print("Error - Invalid credentials")
                return False
        except pymysql.Error as e:
            print("Error", e.args[0], "-", e.args[1])
            return False


def listusers():
    with get_connection() as conn:
        cursor = conn.cursor()
        try:
            cursor.execute("SELECT email, realname FROM users;")
            results = cursor.fetchall()
            print("Success - Retrieved users")
            return results
        except pymysql.Error as e:
            print("Error", e.args[0], "-", e.args[1])
            return {"result": "Error retrieving users"}


def listresults(username):
    with get_connection() as conn:
        cursor = conn.cursor()
        try:
            cursor.execute("SELECT results FROM scoretables WHERE username = %s;", (username,))
            results = cursor.fetchall()
            print("Success - Retrieved results")
            return results
        except pymysql.Error as e:
            print("Error", e.args[0], "-", e.args[1])
            return {"result": "User not found"}


def cleardata(username):
    with get_connection() as conn:
        cursor = conn.cursor()
        try:
            cursor.execute("DELETE FROM scoretables WHERE username = %s;", (username,))
            conn.commit()
            print("Success - Cleared data")
        except pymysql.Error as e:
            print("Error", e.args[0], "-", e.args[1])


def deleteuser(em):
    with get_connection() as conn:
        cursor = conn.cursor()
        try:
            cursor.execute("DELETE FROM scoretables WHERE username = (SELECT username FROM users WHERE email = %s);", (em,))
            cursor.execute("DELETE FROM users WHERE email = %s;", (em,))
            conn.commit()
            print("Success - Deleted user and associated data")
        except pymysql.Error as e:
            print("Error", e.args[0], "-", e.args[1])


def resetpassword(em, new_pw):
    with get_connection() as conn:
        cursor = conn.cursor()
        try:
            cursor.execute("UPDATE users SET password = %s WHERE email = %s;", (new_pw, em))
            conn.commit()
            print("Success - Updated password")
        except pymysql.Error as e:
            print("Error", e.args[0], "-", e.args[1])


def hardreset():
    with get_connection() as conn:
        cursor = conn.cursor()
        try:
            cursor.execute("DELETE FROM scoretables;")
            cursor.execute("DELETE FROM users;")
            conn.commit()
            print("Success - Hard reset completed")
        except pymysql.Error as e:
            print("Error", e.args[0], "-", e.args[1])


# Wire FastAPI routes to the module-level functions so JS can call them without `self`.
@app.on_event("startup")
def _startup():
    setup_tables()


@app.post("/insert_data")
def api_insert_data(username: str, score: int, qar: dict):
    return insert_data(username, score, qar)


@app.post("/new_user")
def api_new_user(em: str, rn: str, un: str, pw: str):
    return new_user(em, rn, un, pw)


@app.post("/auth_user")
def api_authuser(em: str, pw: str):
    return authuser(em, pw)


@app.get("/list_users")
def api_listusers():
    return listusers()


@app.get("/list_results")
def api_listresults(username: str):
    return listresults(username)


@app.delete("/clear_data")
def api_cleardata(username: str):
    return cleardata(username)


@app.delete("/delete_user")
def api_deleteuser(em: str):
    return deleteuser(em)


@app.post("/reset_password")
def api_resetpassword(em: str, new_pw: str):
    return resetpassword(em, new_pw)


@app.delete("/hard_reset")
def api_hardreset():
    return hardreset()

"""
Just a dev note: Here are the URLS and HTML methods for each endpoint in the module:
POST /insert_data - Insert a new score entry for a user
POST /new_user - Create a new user account
POST /auth_user - Authenticate a user by email and password
GET /list_users - Retrieve a list of registered users
GET /list_results - Retrieve stored score results for a user
DELETE /clear_data - Delete all score history for a user
DELETE /delete_user - Delete a user and their associated score data
POST /reset_password - Update a user's password
DELETE /hard_reset - Delete all data from both tables (use with caution)
"""
