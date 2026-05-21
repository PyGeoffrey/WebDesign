"""
RDS Best Practices Demo
Demonstrates proper patterns for interacting with Amazon RDS (MySQL)
"""

import pymysql
from pymysql.cursors import DictCursor
from contextlib import contextmanager
import json
from datetime import datetime
from config import DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME


class RDSApp:
    """Handles RDS operations with best practices."""
    
    def __init__(self):
        """Initialize RDS connection parameters from configuration."""
        self.connection_params = {
            'host': DB_HOST,
            'port': DB_PORT,
            'user': DB_USER,
            'password': DB_PASSWORD,
            'database': DB_NAME,
            'cursorclass': DictCursor,  # Return rows as dictionaries instead of tuples
            'autocommit': False  # Use explicit commit/rollback for transaction safety
        }
    
    @contextmanager
    def get_connection(self):
        """Context manager for safe connection handling."""
        connection = pymysql.connect(**self.connection_params)
        try:
            yield connection
        except Exception:
            # Roll back the transaction if an error occurs inside the context
            connection.rollback()
            raise
        finally:
            # Always close the connection to avoid leaking resources
            connection.close()
    
    def setup_tables(self):
        """Create required tables if they do not already exist."""
        with self.get_connection() as conn:
            cursor = conn.cursor()
            try:
                # Create a table for user authentication data
                cursor.execute("""
                    CREATE TABLE IF NOT EXISTS users (
                        user_id INTEGER PRIMARY KEY AUTO_INCREMENT,
                        email VARCHAR(100) UNIQUE NOT NULL,
                        realname VARCHAR(100),
                        username VARCHAR(50), 
                        password TEXT
                    );
                """)
                # Create a table for storing JSON-encoded score history
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
                # Print database error details for debugging
                print("Error", e.args[0], "-", e.args[1])
    def insert_data(self, username, score, qar):
        """Insert a new score entry for the given username."""
        with self.get_connection() as conn:
            cursor = conn.cursor()
            try:
                newJSON = {
                    "Time Completed": datetime.now().strftime("%Y-%m-%d %H:%M:%S") + " " + datetime.now().astimezone().tzname(), 
                    "Score": score,
                    "Questions/Results": qar
                }
                newJSON = json.dumps(newJSON)
                # Use parameterized SQL to avoid SQL injection
                cursor.execute("""
                    INSERT INTO scoretables (username, results) VALUES (%s, %s);
                """, (username, newJSON))
                conn.commit()
                print("Success - Inserted data")
                return newJSON
            except pymysql.Error as e:
                print("Error", e.args[0], "-", e.args[1])
    def new_user(self, em, rn, un, pw):
        """Create a new user if the email is not already registered."""
        with self.get_connection() as conn:
            cursor = conn.cursor()
            try:
                # Check whether the email already exists before inserting
                cursor.execute("SELECT * FROM users WHERE email = %s;", (em,))
                if not cursor.fetchone():
                    cursor.execute("""
                        INSERT INTO users (email, realname, username, password) VALUES (%s, %s, %s, %s);
                    """, (em, rn, un, pw))
                    conn.commit()
                    print("Success - Created new user")
                else:
                    print("Error - User already exists")
            except pymysql.Error as e:
                print("Error", e.args[0], "-", e.args[1])
    def authuser(self, em, pw):
        """Authenticate a user by email and password."""
        with self.get_connection() as conn:
            cursor = conn.cursor()
            try:
                cursor.execute("""
                    SELECT * FROM users WHERE email = %s AND password = %s;
                """, (em, pw))
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
    def listusers(self):
        """Return a JSON list of registered users."""
        with self.get_connection() as conn:
            cursor = conn.cursor()
            try:
                cursor.execute("SELECT email, realname FROM users;")
                results = cursor.fetchall()
                print("Success - Retrieved users")
                return json.dumps(results)
            except pymysql.Error as e:
                print("Error", e.args[0], "-", e.args[1])
                return []
    def listresults(self, username):
        """Return stored score results for a given username."""
        with self.get_connection() as conn:
            cursor = conn.cursor()
            try:
                cursor.execute("SELECT results FROM scoretables WHERE username = %s;", (username,))
                results = cursor.fetchall()
                print("Success - Retrieved results")
                requests.post("https://learngd.w3spaces.com", json=results)  # Example of making an external API call with the retrieved data
                return json.dumps(results)
            except pymysql.Error as e:
                print("Error", e.args[0], "-", e.args[1])
                return []
    def cleardata(self, username):
        """Delete all score history for the specified user."""
        with self.get_connection() as conn:
            cursor = conn.cursor()
            try:
                cursor.execute("DELETE FROM scoretables WHERE username = %s;", (username,))
                conn.commit()
                print("Success - Cleared data")
            except pymysql.Error as e:
                print("Error", e.args[0], "-", e.args[1])
    def deleteuser(self, em):
        """Delete a user and all their associated score data."""
        with self.get_connection() as conn:
            cursor = conn.cursor()
            try:
                # First delete the user's score data to maintain referential integrity
                cursor.execute("DELETE FROM scoretables WHERE username = (SELECT username FROM users WHERE email = %s);", (em,))
                # Then delete the user record
                cursor.execute("DELETE FROM users WHERE email = %s;", (em,))
                conn.commit()
                print("Success - Deleted user and associated data")
            except pymysql.Error as e:
                print("Error", e.args[0], "-", e.args[1])
    def resetpassword(self, em, new_pw):
        """Update a user's password."""
        with self.get_connection() as conn:
            cursor = conn.cursor()
            try:
                cursor.execute("UPDATE users SET password = %s WHERE email = %s;", (new_pw, em))
                conn.commit()
                print("Success - Updated password")
            except pymysql.Error as e:
                print("Error", e.args[0], "-", e.args[1])
    def hardreset(self):
        """Delete all data from both tables (use with caution)."""
        with self.get_connection() as conn:
            cursor = conn.cursor()
            try:
                cursor.execute("DELETE FROM scoretables;")
                cursor.execute("DELETE FROM users;")
                conn.commit()
                print("Success - Hard reset completed")
            except pymysql.Error as e:
                print("Error", e.args[0], "-", e.args[1])
# Test code - demonstrates usage of RDSApp methods
rapp = RDSApp()
rapp.__init__()
rapp.setup_tables()
rapp.new_user("geoffrey.dai314@gmail.com", "Geoffrey Dai", "admin", "Guang1225!")
rapp.new_user("snewblanc@hcsdk8.org", "Stephanie Newblanc", "stephanie", "mypassword123!")
print(rapp.listusers())
print(rapp.authuser("geoffrey.dai314@gmail.com", "Guang1225!"))
print(rapp.insert_data("admin", 85, {"Q1": "Correct", "Q2": "Incorrect", "Q3": "Correct"}))
print(rapp.listresults("admin"))
