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
            SELECT a.*, t.name
            FROM audit_tags at
            INNER JOIN audit_headers a
                ON at.audit_id = a.audit_id
            INNER JOIN tags t
                ON t.tag_id = at.tag_id
            WHERE at.tag_id = %s;
            """

        try:
            with self.get_db_connection() as conn, conn.cursor() as cur:
                cur.execute(query, (tag_id,))
                return cur.fetchall()
        except pymysql.MySQLError as err:
            print(f"Unexpected {err=}, {type(err)=}")
            raise
