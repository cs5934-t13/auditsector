import pymysql.cursors
import os

def init_db(sql_dir):
    print(sql_dir)
    test_db()

def connect_db():
    return pymysql.connect(
        host="localhost",
        user="root",
        password=os.environ("MYSQL_ROOT_PASSWORD"),
        database="auditsector",
        cursorclass=pymysql.cursors.DictCursor,
    )

def test_db():
    connection = connect_db()

    with connection:
        with connection.cursor() as cursor:
            sql = "CREATE TABLE users (name VARCHAR(255), age INT);"
            cursor.execute(sql)

            sql = "INSERT INTO users VALUES ('Zach Ferguson', 22);"
            cursor.execute(sql)

        connection.commit()

        with connection.cursor() as cursor:
            sql = "SELECT * FROM users;"
            cursor.execute(sql)
            result = cursor.fetchall()
            print(result)