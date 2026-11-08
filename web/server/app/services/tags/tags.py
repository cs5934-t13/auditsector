import os

import pymysql


class Tags:
    def __init__(self, port=3306):
        self.port = port

    def get_db_connection(self):

        return pymysql.connect(
            host="127.0.0.1",
            port=self.port,
            user="root",
            password=os.environ["MYSQL_ROOT_PASSWORD"],
            database="auditsector",
            cursorclass=pymysql.cursors.DictCursor,
        )

    def get_tags(self):
        query = """
            SELECT *
            FROM tags;
            """

        try:
            with self.get_db_connection() as conn, conn.cursor() as cur:
                cur.execute(query)
                return cur.fetchall()
        except pymysql.MySQLError as err:
            print(f"Unexpected {err=}, {type(err)=}")
            raise

    def get_tag(self, tag_id):

        query = """
            SELECT *
            FROM audit_tags AS at
            WHERE at.tag_id = %s
            JOIN audit_headers AS a
                WHERE at.audit_id = a.audit_id
            JOIN tags AS t
                WHERE t.tag_id = %s
            """

        try:
            with self.get_db_connection() as conn, conn.cursor() as cur:
                cur.execute(query, (tag_id,))
                return cur.fetchall()
        except pymysql.MySQLError as err:
            print(f"Unexpected {err=}, {type(err)=}")
            raise
