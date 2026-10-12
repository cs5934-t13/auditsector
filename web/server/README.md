# Web Back-End

The web/server container runs a flask application from the /app folder. 

As a standalone app, it runs on <http://localhost:5000>.

Within the pod, it runs on localhost:5000, but the client nginx server proxies it to <http://localhost:8080/api>.
