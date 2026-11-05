import time

import podman
import pymysql


class DatabaseContainer:
    def __init__(self):
        self.client = podman.PodmanClient(
            base_url="unix:///run/user/1000/podman/podman.sock"
        )

    def start_mysql(self):
        environment = [
            "MYSQL_USER=test",
            "MYSQL_PASSWORD=test",
            "MYSQL_DATABASE=auditsector",
            "MYSQL_ROOT_PASSWORD=test",
        ]
        self.container = self.client.containers.run(
            image="mysql:latest",
            name="mysql-test",
            detach=True,
            environment=environment,
            ports={"3306/tcp": 4321},
        )

    def stop_mysql(self):
        self.container.stop()
        self.container.remove()

    def get_test_db_connection(self):

        # Wait for MySQL to start up
        for _ in range(5):
            time.sleep(5)

            try:
                return pymysql.connect(
                host="127.0.0.1",
                port=4321,
                user="test",
                password="test",
                database="auditsector",
                cursorclass=pymysql.cursors.DictCursor,
                )
            except pymysql.err.OperationalError:
                print("Retrying in 5 seconds")
                continue
