from flask import Flask

app = Flask(__name__)


@app.route("/")
def hello_world():
    return "<h1>Hello AuditSector!</h1>"

@app.route("/test")
def test_api():
    return ["Hello from the server"]
