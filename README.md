# Printer Info Snatcher
Scrapes and returns printer info as JSON to be used as a microservice or an api

### Run with Node
```
node app.js
```
### Request Params
>http://localhost:8000?ip=printer_ip

### Run with Docker

#### Run
```
From docker hub: docker run -p port:8000 -d sproutmaster/printer-info-snatcher
Local Build: docker run -p port:8000 -d username/printer-info-snatcher
```

#### Build Image
```
docker build . -t username/printer-info-snatcher
```

#### Easy Export and Load Image (Linux)
```
docker save <image> | bzip2 | pv | ssh user@host docker load
```

#### Export Image (Linux & Windows)
```
docker save -o <path for generated tar file> <image name>
eg. docker save -o C:/Users/username/Downloads/pis-image.tar username/printer-info-snatcher
```

#### Load Image (Linux & Windows)
```
docker load -i <path to image tar file>
```